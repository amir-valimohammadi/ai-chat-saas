<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-generated-questions-list.php
// هدف: دریافت سوالات تولیدشده از محتوای خزش‌شده سایت

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
$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;

if ($limit < 1) {
    $limit = 20;
}

if ($limit > 100) {
    $limit = 100;
}

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);

    $stmt = $pdo->prepare("
        SELECT
            q.id,
            q.page_id,
            q.chunk_id,
            q.question,
            q.answer_text,
            q.category,
            q.detected_intent,
            q.source_type,
            q.is_user_edited,
            q.source_chunk_hash,
            q.last_seen_crawl_run_id,
            q.preserved_at,
            q.score,
            q.status,
            q.created_at,
            q.updated_at,
            p.url,
            p.title,
            p.main_heading
        FROM ai_generated_questions q
        LEFT JOIN ai_pages p ON p.id = q.page_id
        WHERE q.tenant_id = :tenant_id
          AND q.site_id = :site_id
        ORDER BY q.status ASC, q.score DESC, q.id DESC
        LIMIT {$limit}
    ");

    $stmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
    ]);

    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'site' => [
            'id' => (int) $site['id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
        ],
        'items' => array_map(function ($item) {
            return [
                'id' => (int) $item['id'],
                'page_id' => $item['page_id'] !== null ? (int) $item['page_id'] : null,
                'chunk_id' => $item['chunk_id'] !== null ? (int) $item['chunk_id'] : null,
                'question' => $item['question'],
                'answer_text' => $item['answer_text'],
                'category' => $item['category'],
                'detected_intent' => $item['detected_intent'],
                'source_type' => $item['source_type'],
                'is_user_edited' => (bool) $item['is_user_edited'],
                'source_chunk_hash' => $item['source_chunk_hash'],
                'last_seen_crawl_run_id' => $item['last_seen_crawl_run_id'] !== null
                    ? (int) $item['last_seen_crawl_run_id']
                    : null,
                'preserved_at' => $item['preserved_at'],
                'score' => (float) $item['score'],
                'status' => $item['status'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
                'page' => [
                    'url' => $item['url'],
                    'title' => $item['title'],
                    'main_heading' => $item['main_heading'],
                ],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load generated questions',
        'error' => $e->getMessage()
    ], 500);
}