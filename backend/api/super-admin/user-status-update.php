<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/user-status-update.php
// هدف: فعال / غیرفعال کردن کاربر مشتری توسط Super Admin

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
require_role($user, ['super_admin']);

$input = get_json_input();

$userId = isset($input['user_id']) ? (int) $input['user_id'] : 0;
$isActive = isset($input['is_active']) ? (bool) $input['is_active'] : false;

if ($userId <= 0) {
    json_response([
        'success' => false,
        'message' => 'user_id is required'
    ], 422);
}

try {
    $userStmt = $pdo->prepare("
        SELECT id, role
        FROM users
        WHERE id = :user_id
          AND role IN ('customer_admin', 'agent')
        LIMIT 1
    ");

    $userStmt->execute([
        ':user_id' => $userId,
    ]);

    $targetUser = $userStmt->fetch();

    if (!$targetUser) {
        json_response([
            'success' => false,
            'message' => 'User not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        UPDATE users
        SET is_active = :is_active
        WHERE id = :user_id
          AND role IN ('customer_admin', 'agent')
    ");

    $stmt->execute([
        ':is_active' => $isActive ? 1 : 0,
        ':user_id' => $userId,
    ]);

    json_response([
        'success' => true,
        'message' => 'User status updated',
        'is_active' => $isActive,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update user status',
        'error' => $e->getMessage()
    ], 500);
}