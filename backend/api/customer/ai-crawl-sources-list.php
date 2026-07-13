<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-crawl-sources-list.php
// هدف: دریافت لیست منابع مجاز خزش AI برای سایت مشتری

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

    $stmt = $pdo->prepare(" 
        SELECT
            id,
            tenant_id,
            site_id,
            source_type,
            source_value,
            label,
            category_hint,
            is_active,
            created_by,
            last_crawled_at,
            created_at,
            updated_at
        FROM ai_crawl_sources
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
        ORDER BY is_active DESC, id DESC
    ");

    $stmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
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
                'tenant_id' => (int) $item['tenant_id'],
                'site_id' => (int) $item['site_id'],
                'source_type' => $item['source_type'],
                'source_value' => $item['source_value'],
                'label' => $item['label'],
                'category_hint' => $item['category_hint'],
                'is_active' => (bool) $item['is_active'],
                'created_by' => $item['created_by'] !== null ? (int) $item['created_by'] : null,
                'last_crawled_at' => $item['last_crawled_at'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load AI crawl sources',
        'error' => $e->getMessage()
    ], 500);
}