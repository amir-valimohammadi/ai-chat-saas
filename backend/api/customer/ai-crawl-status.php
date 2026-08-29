<?php

// مسیر فایل: backend/api/customer/ai-crawl-status.php
// هدف: دریافت وضعیت لحظه‌ای و پیشرفت خزش برای نمایش نوار پیشرفت

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-crawl-jobs.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;
$runId = isset($_GET['run_id']) ? (int) $_GET['run_id'] : 0;

try {
    if ($runId > 0) {
        $run = ai_crawl_get_run($pdo, (int) $user['tenant_id'], $runId);

        if (!$run) {
            json_response([
                'success' => false,
                'message' => 'اجرای خزش پیدا نشد.'
            ], 404);
        }

        ai_get_customer_site($pdo, $user, (int) $run['site_id']);

        json_response([
            'success' => true,
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    $site = ai_get_customer_site($pdo, $user, $siteId);
    $activeRun = ai_crawl_get_active_run($pdo, (int) $user['tenant_id'], (int) $site['id']);

    $latestStmt = $pdo->prepare("
        SELECT *
        FROM ai_crawl_runs
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
        ORDER BY id DESC
        LIMIT 1
    ");
    $latestStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $site['id'],
    ]);
    $latestRun = $latestStmt->fetch() ?: null;

    json_response([
        'success' => true,
        'active_run' => $activeRun ? ai_crawl_run_to_array($activeRun) : null,
        'latest_run' => $latestRun ? ai_crawl_run_to_array($latestRun) : null,
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'دریافت وضعیت خزش ناموفق بود.',
        ...safe_api_exception_context($e),
    ], 500);
}
