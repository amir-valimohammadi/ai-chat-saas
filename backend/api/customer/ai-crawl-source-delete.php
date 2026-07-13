<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-crawl-source-delete.php
// هدف: غیرفعال کردن منبع خزش AI برای سایت مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$input = get_json_input();
$itemId = isset($input['id']) ? (int) $input['id'] : 0;

if ($itemId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Crawl source ID is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare(" 
        UPDATE ai_crawl_sources
        INNER JOIN sites ON sites.id = ai_crawl_sources.site_id
        SET ai_crawl_sources.is_active = 0
        WHERE ai_crawl_sources.id = :id
          AND sites.tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':id' => $itemId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'AI crawl source disabled successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to disable AI crawl source',
        'error' => $e->getMessage()
    ], 500);
}