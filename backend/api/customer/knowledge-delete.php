<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/knowledge-delete.php
// هدف: آرشیو کردن یک آیتم دانش مشتری

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
        'message' => 'Knowledge item ID is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE knowledge_sources
        INNER JOIN sites ON sites.id = knowledge_sources.site_id
        SET knowledge_sources.status = 'archived'
        WHERE knowledge_sources.id = :id
          AND sites.tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':id' => $itemId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Knowledge item archived successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to archive knowledge item',
        'error' => $e->getMessage()
    ], 500);
}