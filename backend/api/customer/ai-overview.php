<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-overview.php
// هدف: نمایش خلاصه وضعیت AI Knowledge برای سایت مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
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

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);

    $countSql = [
        'pages' => "SELECT COUNT(*) FROM ai_pages WHERE tenant_id = :tenant_id AND site_id = :site_id",
        'chunks' => "SELECT COUNT(*) FROM ai_content_chunks WHERE tenant_id = :tenant_id AND site_id = :site_id AND status = 'active'",
        'terms' => "SELECT COUNT(*) FROM ai_terms WHERE tenant_id = :tenant_id AND site_id = :site_id",
        'questions' => "SELECT COUNT(*) FROM ai_generated_questions WHERE tenant_id = :tenant_id AND site_id = :site_id AND status = 'active'",
        'unanswered' => "SELECT COUNT(*) FROM ai_unanswered_questions WHERE tenant_id = :tenant_id AND site_id = :site_id AND status = 'new'",
        'unanswered_occurrences' => "SELECT COALESCE(SUM(occurrence_count), 0) FROM ai_unanswered_questions WHERE tenant_id = :tenant_id AND site_id = :site_id AND status = 'new'",
        'answer_logs' => "SELECT COUNT(*) FROM ai_answer_logs WHERE tenant_id = :tenant_id AND site_id = :site_id AND request_source <> 'test'",
        'test_logs' => "SELECT COUNT(*) FROM ai_answer_logs WHERE tenant_id = :tenant_id AND site_id = :site_id AND request_source = 'test'",
    ];

    $counts = [];

    foreach ($countSql as $key => $sql) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':tenant_id' => $user['tenant_id'],
            ':site_id' => $siteId,
        ]);

        $counts[$key] = (int) $stmt->fetchColumn();
    }

    $runsStmt = $pdo->prepare("
        SELECT
            id,
            status,
            current_stage,
            current_message,
            current_url,
            progress_percent,
            total_urls,
            queued_urls,
            processed_urls,
            fetched_pages,
            failed_pages,
            created_chunks,
            created_terms,
            created_questions,
            unchanged_pages,
            preserved_questions,
            archived_questions,
            error_message,
            started_at,
            finished_at,
            created_at
        FROM ai_crawl_runs
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
        ORDER BY id DESC
        LIMIT 5
    ");

    $runsStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
    ]);

    $runs = $runsStmt->fetchAll();

    $pagesStmt = $pdo->prepare("
        SELECT
            id,
            url,
            title,
            main_heading,
            category,
            detected_intent,
            crawl_status,
            word_count,
            last_crawled_at
        FROM ai_pages
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
        ORDER BY id DESC
        LIMIT 10
    ");

    $pagesStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
    ]);

    $pages = $pagesStmt->fetchAll();

    json_response([
        'success' => true,
        'site' => [
            'id' => (int) $site['id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
        ],
        'counts' => $counts,
        'recent_runs' => array_map(function ($run) {
            return [
                'id' => (int) $run['id'],
                'status' => $run['status'],
                'current_stage' => $run['current_stage'],
                'current_message' => $run['current_message'],
                'current_url' => $run['current_url'],
                'progress_percent' => (int) $run['progress_percent'],
                'total_urls' => (int) $run['total_urls'],
                'queued_urls' => (int) $run['queued_urls'],
                'processed_urls' => (int) $run['processed_urls'],
                'fetched_pages' => (int) $run['fetched_pages'],
                'failed_pages' => (int) $run['failed_pages'],
                'created_chunks' => (int) $run['created_chunks'],
                'created_terms' => (int) $run['created_terms'],
                'created_questions' => (int) $run['created_questions'],
                'unchanged_pages' => (int) $run['unchanged_pages'],
                'preserved_questions' => (int) $run['preserved_questions'],
                'archived_questions' => (int) $run['archived_questions'],
                'error_message' => $run['error_message'],
                'started_at' => $run['started_at'],
                'finished_at' => $run['finished_at'],
                'created_at' => $run['created_at'],
            ];
        }, $runs),
        'recent_pages' => array_map(function ($page) {
            return [
                'id' => (int) $page['id'],
                'url' => $page['url'],
                'title' => $page['title'],
                'main_heading' => $page['main_heading'],
                'category' => $page['category'],
                'detected_intent' => $page['detected_intent'],
                'crawl_status' => $page['crawl_status'],
                'word_count' => (int) $page['word_count'],
                'last_crawled_at' => $page['last_crawled_at'],
            ];
        }, $pages)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load AI overview',
        ...safe_api_exception_context($e)
    ], 500);
}