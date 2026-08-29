<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/quick-replies-delete.php
// هدف: غیرفعال کردن پاسخ آماده توسط Customer Admin

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
        'message' => 'Quick reply ID is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE quick_replies
        INNER JOIN sites ON sites.id = quick_replies.site_id
        SET quick_replies.is_active = 0
        WHERE quick_replies.id = :id
          AND sites.tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':id' => $itemId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Quick reply disabled successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to disable quick reply',
        ...safe_api_exception_context($e)
    ], 500);
}