<?php

// مسیر فایل: backend/api/customer/ai-crawl-start.php
// هدف: ایجاد Job خزش مرحله‌ای و آماده‌سازی صف لینک‌های داخلی

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-crawler.php';
require_once __DIR__ . '/../../includes/ai-crawl-jobs.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/subscription.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
require_active_subscription($pdo, (int) $user['tenant_id'], 'crawl_start');

$input = get_json_input();
$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);
    require_site_plan_feature($pdo, $siteId, 'knowledge_base_enabled', 'Knowledge Base');

    $activeRun = ai_crawl_get_active_run($pdo, (int) $user['tenant_id'], $siteId);

    if ($activeRun) {
        json_response([
            'success' => true,
            'message' => 'یک خزش فعال از قبل وجود دارد و ادامه داده می‌شود.',
            'resumed' => true,
            'run' => ai_crawl_run_to_array($activeRun),
        ]);
    }

    $settingsStmt = $pdo->prepare("
        SELECT crawl_enabled, max_pages_per_crawl, max_depth
        FROM ai_site_settings
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");
    $settingsStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);
    $settings = $settingsStmt->fetch() ?: [
        'crawl_enabled' => 1,
        'max_pages_per_crawl' => 30,
        'max_depth' => 1,
    ];

    if ((int) $settings['crawl_enabled'] !== 1) {
        json_response([
            'success' => false,
            'message' => 'خزش برای این سایت غیرفعال است.'
        ], 422);
    }

    $maxPages = max(1, min(100, (int) $settings['max_pages_per_crawl']));
    $maxDepth = max(0, min(3, (int) $settings['max_depth']));

    $sourcesStmt = $pdo->prepare("
        SELECT *
        FROM ai_crawl_sources
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
          AND is_active = 1
        ORDER BY id ASC
    ");
    $sourcesStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);
    $sources = $sourcesStmt->fetchAll();

    if (!$sources) {
        json_response([
            'success' => false,
            'message' => 'هیچ منبع داخلی فعالی برای خزش ثبت نشده است.'
        ], 422);
    }

    // همه منابع را پیش از شروع Transaction اعتبارسنجی می‌کنیم؛
    // در نتیجه اگر منبع قدیمی یا خارج از محدوده وجود داشته باشد،
    // بدون باقی‌ماندن Transaction باز، خطای دقیق 422 برمی‌گردد.
    $preparedSources = [];

    foreach ($sources as $source) {
        $internalPath = ai_validate_crawl_source(
            (string) $source['source_type'],
            (string) $source['source_value'],
            (string) $site['domain']
        );
        $url = ai_site_url_from_internal_path((string) $site['domain'], $internalPath);

        if (!$url) {
            json_response([
                'success' => false,
                'message' => 'یکی از منابع خزش به مسیر داخلی معتبر تبدیل نشد.'
            ], 422);
        }

        $preparedSources[] = [
            'id' => (int) $source['id'],
            'item_type' => $source['source_type'] === 'sitemap' ? 'sitemap' : 'page',
            'url' => $url,
            'path_prefix' => $source['source_type'] === 'path_prefix' ? $internalPath : null,
        ];
    }

    $pdo->beginTransaction();

    $runStmt = $pdo->prepare("
        INSERT INTO ai_crawl_runs (
            tenant_id,
            site_id,
            started_by,
            status,
            current_stage,
            current_message,
            progress_percent,
            page_limit,
            max_depth,
            started_at,
            last_activity_at
        ) VALUES (
            :tenant_id,
            :site_id,
            :started_by,
            'queued',
            'preparing',
            'در حال بررسی منابع داخلی سایت…',
            3,
            :page_limit,
            :max_depth,
            NOW(),
            NOW()
        )
    ");
    $runStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
        ':started_by' => $user['id'],
        ':page_limit' => $maxPages,
        ':max_depth' => $maxDepth,
    ]);

    $runId = (int) $pdo->lastInsertId();
    $run = ai_crawl_get_run($pdo, (int) $user['tenant_id'], $runId);

    if (!$run) {
        throw new RuntimeException('Failed to create crawl run');
    }

    $run['site_domain'] = $site['domain'];
    $queuedSeeds = 0;

    foreach ($preparedSources as $source) {
        if (ai_crawl_enqueue_item(
            $pdo,
            $run,
            $source['id'],
            $source['item_type'],
            $source['url'],
            0,
            $source['path_prefix'],
            null
        )) {
            $queuedSeeds++;
        }
    }

    if ($queuedSeeds === 0) {
        throw new RuntimeException('No valid internal crawl source could be queued');
    }

    $pdo->commit();

    ai_crawl_update_stage(
        $pdo,
        (int) $user['tenant_id'],
        $runId,
        'discovering',
        'منابع داخلی آماده شدند؛ در حال شروع کشف صفحات…',
        null,
        8
    );

    $run = ai_crawl_recalculate_progress($pdo, (int) $user['tenant_id'], $runId);
    unset($run['_queue']);

    json_response([
        'success' => true,
        'message' => 'Job خزش ایجاد شد.',
        'resumed' => false,
        'run' => ai_crawl_run_to_array($run),
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    if (!empty($runId)) {
        $failStmt = $pdo->prepare("
            UPDATE ai_crawl_runs
            SET
                status = 'failed',
                current_stage = 'failed',
                current_message = 'آماده‌سازی خزش ناموفق بود.',
                error_message = :error_message,
                finished_at = NOW(),
                last_activity_at = NOW()
            WHERE id = :id
              AND tenant_id = :tenant_id
        ");
        $failStmt->execute([
            ':error_message' => $e->getMessage(),
            ':id' => $runId,
            ':tenant_id' => $user['tenant_id'],
        ]);
    }

    json_response([
        'success' => false,
        'message' => 'شروع خزش ناموفق بود.',
        ...safe_api_exception_context($e),
    ], 500);
}
