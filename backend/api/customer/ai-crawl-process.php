<?php

// مسیر فایل: backend/api/customer/ai-crawl-process.php
// هدف: پردازش یک مرحله واقعی از صف خزش و بروزرسانی پیشرفت

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-crawler.php';
require_once __DIR__ . '/../../includes/ai-crawl-jobs.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/subscription.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
require_active_subscription($pdo, (int) $user['tenant_id'], 'crawl_process');

$input = get_json_input();
$runId = isset($input['run_id']) ? (int) $input['run_id'] : 0;

if ($runId <= 0) {
    json_response([
        'success' => false,
        'message' => 'شناسه اجرای خزش الزامی است.'
    ], 422);
}

function ai_crawl_finish_queue_item(
    PDO $pdo,
    int $itemId,
    string $status,
    ?int $statusCode = null,
    ?string $errorMessage = null
): void {
    $stmt = $pdo->prepare("
        UPDATE ai_crawl_queue
        SET
            status = :status,
            status_code = :status_code,
            error_message = :error_message,
            processed_at = NOW()
        WHERE id = :id
    ");
    $stmt->execute([
        ':status' => $status,
        ':status_code' => $statusCode,
        ':error_message' => $errorMessage !== null ? mb_substr($errorMessage, 0, 1000) : null,
        ':id' => $itemId,
    ]);
}

try {
    $run = ai_crawl_get_run($pdo, (int) $user['tenant_id'], $runId);

    if (!$run) {
        json_response([
            'success' => false,
            'message' => 'اجرای خزش پیدا نشد.'
        ], 404);
    }

    $site = ai_get_customer_site($pdo, $user, (int) $run['site_id']);
    $run['site_domain'] = $site['domain'];

    if (in_array($run['status'], ['completed', 'failed', 'cancelled'], true)) {
        json_response([
            'success' => true,
            'message' => 'اجرای خزش پایان یافته است.',
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    $pdo->beginTransaction();

    // اگر درخواست قبلی قطع شده باشد، آیتم پردازش‌نشده پس از دو دقیقه دوباره به صف برمی‌گردد.
    $recoverStmt = $pdo->prepare("
        UPDATE ai_crawl_queue
        SET status = 'queued', error_message = 'Recovered after interrupted request'
        WHERE crawl_run_id = :run_id
          AND tenant_id = :tenant_id
          AND status = 'processing'
          AND updated_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
    ");
    $recoverStmt->execute([
        ':run_id' => $runId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    $itemStmt = $pdo->prepare("
        SELECT
            q.*,
            cs.is_active AS source_is_active,
            cs.category_hint
        FROM ai_crawl_queue q
        LEFT JOIN ai_crawl_sources cs ON cs.id = q.source_id
        WHERE q.crawl_run_id = :run_id
          AND q.tenant_id = :tenant_id
          AND q.status = 'queued'
        ORDER BY
            CASE WHEN q.item_type = 'sitemap' THEN 0 ELSE 1 END,
            q.depth ASC,
            q.id ASC
        LIMIT 1
        FOR UPDATE
    ");
    $itemStmt->execute([
        ':run_id' => $runId,
        ':tenant_id' => $user['tenant_id'],
    ]);
    $item = $itemStmt->fetch();

    if (!$item) {
        $pdo->commit();
        $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

        json_response([
            'success' => true,
            'message' => $run['status'] === 'completed' ? 'خزش کامل شد.' : 'صف خزش در حال نهایی‌شدن است.',
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    $claimStmt = $pdo->prepare("
        UPDATE ai_crawl_queue
        SET status = 'processing', error_message = NULL
        WHERE id = :id
          AND status = 'queued'
    ");
    $claimStmt->execute([':id' => $item['id']]);

    if ($claimStmt->rowCount() !== 1) {
        $pdo->rollBack();
        json_response([
            'success' => true,
            'message' => 'آیتم توسط پردازش دیگری دریافت شد؛ تلاش بعدی انجام می‌شود.',
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    $pdo->commit();

    if ($item['source_id'] !== null && (int) ($item['source_is_active'] ?? 0) !== 1) {
        ai_crawl_finish_queue_item($pdo, (int) $item['id'], 'skipped', null, 'Crawl source is disabled');
        $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

        json_response([
            'success' => true,
            'message' => 'منبع غیرفعال بود و از صف کنار گذاشته شد.',
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    ai_crawl_update_stage(
        $pdo,
        (int) $user['tenant_id'],
        $runId,
        'fetching',
        $item['item_type'] === 'sitemap'
            ? 'در حال دریافت نقشه سایت داخلی…'
            : 'در حال دریافت صفحه داخلی…',
        $item['url'],
        10
    );

    $fetch = ai_fetch_url((string) $item['url'], (string) $site['domain']);

    if (!$fetch['success']) {
        ai_crawl_finish_queue_item(
            $pdo,
            (int) $item['id'],
            'failed',
            (int) ($fetch['status_code'] ?? 0),
            (string) ($fetch['error'] ?? 'Failed to fetch URL')
        );

        $failedStmt = $pdo->prepare("
            UPDATE ai_crawl_runs
            SET failed_pages = failed_pages + 1
            WHERE id = :id AND tenant_id = :tenant_id
        ");
        $failedStmt->execute([
            ':id' => $runId,
            ':tenant_id' => $user['tenant_id'],
        ]);

        $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

        json_response([
            'success' => true,
            'message' => 'دریافت این آدرس ناموفق بود و خزش با آیتم بعدی ادامه پیدا می‌کند.',
            'item' => [
                'url' => $item['url'],
                'status' => 'failed',
                'error' => $fetch['error'] ?? null,
            ],
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    $effectiveUrl = (string) ($fetch['effective_url'] ?? $item['url']);

    if ($item['item_type'] === 'sitemap') {
        ai_crawl_update_stage(
            $pdo,
            (int) $user['tenant_id'],
            $runId,
            'discovering',
            'در حال استخراج و بررسی لینک‌های داخلی نقشه سایت…',
            $effectiveUrl,
            12
        );

        $urls = ai_extract_sitemap_urls((string) $fetch['body']);
        $added = 0;
        $rejected = 0;

        foreach ($urls as $url) {
            $url = ai_clean_url((string) $url);

            if (!ai_url_belongs_to_site_scope($url, (string) $site['domain'])) {
                $rejected++;
                continue;
            }

            $path = ai_internal_path_for_url($url, (string) $site['domain']);

            if ($path === null) {
                $rejected++;
                continue;
            }

            $itemType = preg_match('/\.xml(?:\?|$)/i', $path) ? 'sitemap' : 'page';

            if (ai_crawl_enqueue_item(
                $pdo,
                $run,
                $item['source_id'] !== null ? (int) $item['source_id'] : null,
                $itemType,
                $url,
                0,
                null,
                $effectiveUrl
            )) {
                $added++;
            }
        }

        ai_crawl_finish_queue_item($pdo, (int) $item['id'], 'completed', (int) $fetch['status_code']);
        $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

        json_response([
            'success' => true,
            'message' => "نقشه سایت بررسی شد؛ {$added} لینک داخلی به صف اضافه شد.",
            'item' => [
                'url' => $effectiveUrl,
                'status' => 'completed',
                'discovered_internal_urls' => $added,
                'rejected_external_urls' => $rejected,
            ],
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    $contentType = strtolower((string) ($fetch['content_type'] ?? ''));

    if ($contentType !== '' && !str_contains($contentType, 'html') && !str_contains($contentType, 'xhtml')) {
        ai_crawl_finish_queue_item(
            $pdo,
            (int) $item['id'],
            'ignored',
            (int) $fetch['status_code'],
            'Non-HTML content type'
        );
        $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

        json_response([
            'success' => true,
            'message' => 'این آدرس صفحه HTML نبود و نادیده گرفته شد.',
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    ai_crawl_update_stage(
        $pdo,
        (int) $user['tenant_id'],
        $runId,
        'extracting',
        'در حال استخراج متن خوانا و لینک‌های داخلی صفحه…',
        $effectiveUrl,
        null
    );

    $content = ai_extract_html_content((string) $fetch['body']);

    if (mb_strlen((string) $content['clean_text']) < 80) {
        ai_crawl_finish_queue_item(
            $pdo,
            (int) $item['id'],
            'ignored',
            (int) $fetch['status_code'],
            'Page content is too short'
        );

        $ignoredStmt = $pdo->prepare("
            UPDATE ai_crawl_runs
            SET failed_pages = failed_pages + 1
            WHERE id = :id AND tenant_id = :tenant_id
        ");
        $ignoredStmt->execute([
            ':id' => $runId,
            ':tenant_id' => $user['tenant_id'],
        ]);

        $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

        json_response([
            'success' => true,
            'message' => 'محتوای صفحه برای ساخت دانش کافی نبود.',
            'run' => ai_crawl_run_to_array($run),
        ]);
    }

    ai_crawl_update_stage(
        $pdo,
        (int) $user['tenant_id'],
        $runId,
        'storing',
        'در حال ساخت بخش‌های دانش، کلیدواژه‌ها و سؤال‌های پیشنهادی…',
        $effectiveUrl,
        null
    );

    $storeResult = ai_store_page_knowledge(
        $pdo,
        $site,
        $runId,
        $item['source_id'] !== null ? (int) $item['source_id'] : null,
        $effectiveUrl,
        (int) $fetch['status_code'],
        $content,
        $item['category_hint'] ?? null
    );

    $updateRunStmt = $pdo->prepare("
        UPDATE ai_crawl_runs
        SET
            fetched_pages = fetched_pages + 1,
            created_chunks = created_chunks + :created_chunks,
            created_terms = created_terms + :created_terms,
            created_questions = created_questions + :created_questions,
            unchanged_pages = unchanged_pages + :unchanged_pages,
            preserved_questions = preserved_questions + :preserved_questions,
            archived_questions = archived_questions + :archived_questions
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");
    $updateRunStmt->execute([
        ':created_chunks' => (int) ($storeResult['chunks'] ?? 0),
        ':created_terms' => (int) ($storeResult['terms'] ?? 0),
        ':created_questions' => (int) ($storeResult['questions'] ?? 0),
        ':unchanged_pages' => !empty($storeResult['unchanged']) ? 1 : 0,
        ':preserved_questions' => (int) ($storeResult['preserved_questions'] ?? 0),
        ':archived_questions' => (int) ($storeResult['archived_questions'] ?? 0),
        ':id' => $runId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    if ((int) $item['depth'] < (int) $run['max_depth']) {
        ai_crawl_update_stage(
            $pdo,
            (int) $user['tenant_id'],
            $runId,
            'discovering',
            'در حال بررسی لینک‌های داخلی پیدا‌شده در این صفحه…',
            $effectiveUrl,
            null
        );

        foreach ($content['links'] as $href) {
            $nextUrl = ai_absolute_url($effectiveUrl, (string) $href);

            if (!$nextUrl || !ai_url_belongs_to_site_scope($nextUrl, (string) $site['domain'])) {
                continue;
            }

            $internalPath = ai_internal_path_for_url($nextUrl, (string) $site['domain']);

            if ($internalPath === null) {
                continue;
            }

            if ($item['path_prefix'] && !ai_internal_path_matches_prefix($internalPath, (string) $item['path_prefix'])) {
                continue;
            }

            ai_crawl_enqueue_item(
                $pdo,
                $run,
                $item['source_id'] !== null ? (int) $item['source_id'] : null,
                'page',
                $nextUrl,
                (int) $item['depth'] + 1,
                $item['path_prefix'] ?: null,
                $effectiveUrl
            );
        }
    }

    ai_crawl_finish_queue_item($pdo, (int) $item['id'], 'completed', (int) $fetch['status_code']);
    $run = ai_crawl_maybe_finalize($pdo, (int) $user['tenant_id'], $runId);

    json_response([
        'success' => true,
        'message' => !empty($storeResult['unchanged'])
            ? 'صفحه تغییری نداشت و دانش قبلی حفظ شد.'
            : 'صفحه تحلیل و دانش آن بروزرسانی شد.',
        'item' => [
            'url' => $effectiveUrl,
            'status' => 'completed',
            'page_id' => (int) ($storeResult['page_id'] ?? 0),
            'unchanged' => (bool) ($storeResult['unchanged'] ?? false),
            'chunks' => (int) ($storeResult['chunks'] ?? 0),
            'terms' => (int) ($storeResult['terms'] ?? 0),
            'questions' => (int) ($storeResult['questions'] ?? 0),
            'preserved_questions' => (int) ($storeResult['preserved_questions'] ?? 0),
        ],
        'run' => ai_crawl_run_to_array($run),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    if (!empty($item['id'])) {
        ai_crawl_finish_queue_item($pdo, (int) $item['id'], 'failed', null, $e->getMessage());
    }

    $failStmt = $pdo->prepare("
        UPDATE ai_crawl_runs
        SET
            status = 'failed',
            current_stage = 'failed',
            current_message = 'خزش به‌دلیل خطای داخلی متوقف شد.',
            error_message = :error_message,
            current_url = NULL,
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

    $failedRun = ai_crawl_get_run($pdo, (int) $user['tenant_id'], $runId);

    json_response([
        'success' => false,
        'message' => 'پردازش خزش ناموفق بود.',
        'error' => $e->getMessage(),
        'run' => $failedRun ? ai_crawl_run_to_array($failedRun) : null,
    ], 500);
}
