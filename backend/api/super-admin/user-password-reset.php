<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/user-password-reset.php
// هدف: تنظیم رمز جدید برای کاربر مشتری توسط Super Admin

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
$password = trim($input['password'] ?? '');

if ($userId <= 0) {
    json_response([
        'success' => false,
        'message' => 'user_id is required'
    ], 422);
}

if (mb_strlen($password, 'UTF-8') < 8) {
    json_response([
        'success' => false,
        'message' => 'Password must be at least 8 characters'
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

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("
        UPDATE users
        SET password_hash = :password_hash
        WHERE id = :user_id
          AND role IN ('customer_admin', 'agent')
    ");

    $stmt->execute([
        ':password_hash' => $passwordHash,
        ':user_id' => $userId,
    ]);

    json_response([
        'success' => true,
        'message' => 'User password updated'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update user password',
        'error' => $e->getMessage()
    ], 500);
}