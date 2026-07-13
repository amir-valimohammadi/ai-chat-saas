<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/quick-replies-list.php
// هدف: دریافت پاسخ‌های آماده سایت‌های مشتری

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
        $siteSql = ' AND quick_replies.site_id = :site_id ';
        $params[':site_id'] = $siteId;
    }

    $stmt = $pdo->prepare("
        SELECT
            quick_replies.id,
            quick_replies.site_id,
            sites.name AS site_name,
            quick_replies.title,
            quick_replies.content,
            quick_replies.category,
            quick_replies.is_active,
            quick_replies.created_at,
            quick_replies.updated_at
        FROM quick_replies
        INNER JOIN sites ON sites.id = quick_replies.site_id
        WHERE sites.tenant_id = :tenant_id
          {$siteSql}
        ORDER BY quick_replies.id DESC
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
                'title' => $item['title'],
                'content' => $item['content'],
                'category' => $item['category'],
                'is_active' => (bool) $item['is_active'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load quick replies',
        'error' => $e->getMessage()
    ], 500);
}