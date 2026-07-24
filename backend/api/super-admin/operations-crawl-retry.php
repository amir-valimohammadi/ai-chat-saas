<?php

// مسیر فایل: backend/api/super-admin/operations-crawl-retry.php
// هدف: Retry امن اجرای خزش ناموفق یا لغوشده

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/ai-crawl-jobs.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();
$runId = filter_var($input['run_id'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

if (!$runId) {
    json_response(['success' => false, 'message' => 'شناسه اجرای خزش معتبر نیست.'], 422);
}

try {
    $runStmt = $pdo->prepare("
        SELECT r.*, t.name AS tenant_name, s.name AS site_name
        FROM ai_crawl_runs r
        INNER JOIN tenants t ON t.id = r.tenant_id
        INNER JOIN sites s ON s.id = r.site_id
        WHERE r.id = :id
        LIMIT 1
    ");
    $runStmt->execute([':id' => $runId]);
    $run = $runStmt->fetch();

    if (!$run) {
        json_response(['success' => false, 'message' => 'اجرای خزش پیدا نشد.'], 404);
    }

    if (!in_array($run['status'], ['failed', 'cancelled'], true)) {
        json_response(['success' => false, 'message' => 'فقط خزش ناموفق یا لغوشده قابل Retry است.'], 422);
    }

    $activeStmt = $pdo->prepare("
        SELECT id FROM ai_crawl_runs
        WHERE site_id = :site_id AND status IN ('queued','running') AND id <> :id
        LIMIT 1
    ");
    $activeStmt->execute([':site_id' => $run['site_id'], ':id' => $runId]);
    if ($activeStmt->fetch()) {
        json_response(['success' => false, 'message' => 'برای این سایت یک خزش فعال دیگر وجود دارد.'], 409);
    }

    $retryableStmt = $pdo->prepare("
        SELECT COUNT(*) FROM ai_crawl_queue
        WHERE crawl_run_id = :run_id AND status IN ('queued','failed','processing')
    ");
    $retryableStmt->execute([':run_id' => $runId]);
    if ((int) $retryableStmt->fetchColumn() === 0) {
        json_response(['success' => false, 'message' => 'آیتم قابل Retry در صف این اجرا وجود ندارد.'], 422);
    }

    $pdo->beginTransaction();

    $queueUpdate = $pdo->prepare("
        UPDATE ai_crawl_queue
        SET status = 'queued', status_code = NULL, error_message = NULL,
            processed_at = NULL, updated_at = NOW()
        WHERE crawl_run_id = :run_id
          AND status IN ('failed','processing')
    ");
    $queueUpdate->execute([':run_id' => $runId]);

    $runUpdate = $pdo->prepare("
        UPDATE ai_crawl_runs
        SET status = 'queued', current_stage = 'retrying',
            current_message = 'اجرای ناموفق توسط مدیر دوباره در صف قرار گرفت.',
            error_message = NULL, failed_pages = 0, finished_at = NULL,
            last_activity_at = NOW(), updated_at = NOW()
        WHERE id = :id
    ");
    $runUpdate->execute([':id' => $runId]);

    admin_audit_log(
        $pdo,
        $user,
        'system.crawl_retried',
        'ai_crawl_run',
        (int) $runId,
        sprintf('خزش سایت «%s» برای مشتری «%s» دوباره در صف قرار گرفت.', $run['site_name'], $run['tenant_name']),
        ['status' => $run['status'], 'error_message' => $run['error_message']],
        ['status' => 'queued', 'current_stage' => 'retrying'],
        ['tenant_id' => (int) $run['tenant_id'], 'site_id' => (int) $run['site_id']]
    );

    $pdo->commit();
    $freshRun = ai_crawl_recalculate_progress($pdo, (int) $run['tenant_id'], (int) $runId);
    unset($freshRun['_queue']);

    json_response([
        'success' => true,
        'message' => 'اجرای خزش دوباره در صف قرار گرفت.',
        'run' => ai_crawl_run_to_array($freshRun),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    app_log_error($e, ['component' => 'crawl_retry', 'run_id' => $runId, 'status_code' => 500]);
    json_response(['success' => false, 'message' => 'Retry خزش ناموفق بود.'], 500);
}
