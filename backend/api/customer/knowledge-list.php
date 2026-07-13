<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/knowledge-list.php
// هدف: دریافت دانش ثبت‌شده برای سایت‌های مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
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
    $params = [
        ':tenant_id' => $user['tenant_id'],
    ];

    $siteSql = '';

    if ($siteId > 0) {
        $siteSql = ' AND knowledge_sources.site_id = :site_id ';
        $params[':site_id'] = $siteId;
    }

    $stmt = $pdo->prepare("
        SELECT
            knowledge_sources.id,
            knowledge_sources.site_id,
            sites.name AS site_name,
            knowledge_sources.type,
            knowledge_sources.title,
            knowledge_sources.question,
            knowledge_sources.answer,
            knowledge_sources.content,
            knowledge_sources.url,
            knowledge_sources.status,
            knowledge_sources.created_at,
            knowledge_sources.updated_at
        FROM knowledge_sources
        INNER JOIN sites ON sites.id = knowledge_sources.site_id
        WHERE sites.tenant_id = :tenant_id
          AND knowledge_sources.status != 'archived'
          {$siteSql}
        ORDER BY knowledge_sources.id DESC
    ");

    $stmt->execute($params);

    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'items' => array_map(function ($item) {
            return [
                'id' => (int) $item['id'],
                'site_id' => (int) $item['site_id'],
                'site_name' => $item['site_name'],
                'type' => $item['type'],
                'title' => $item['title'],
                'question' => $item['question'],
                'answer' => $item['answer'],
                'content' => $item['content'],
                'url' => $item['url'],
                'status' => $item['status'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load knowledge',
        'error' => $e->getMessage()
    ], 500);
}