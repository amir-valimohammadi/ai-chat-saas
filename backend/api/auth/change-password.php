<?php

// مسیر فایل: ai-chat-saas/backend/api/auth/change-password.php
// هدف: تغییر رمز عبور کاربر لاگین‌شده و باطل کردن توکن‌های قبلی

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/auth-session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);

$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

enforce_rate_limit(
    $pdo,
    'auth_change_password',
    rate_limit_identifier('user:' . $user['id'] . '|ip:' . $clientIp),
    8,
    15 * 60,
    'Too many password change attempts. Please try again later.'
);

$input = get_json_input();

$currentPassword = (string) ($input['current_password'] ?? '');
$newPassword = (string) ($input['new_password'] ?? '');
$newPasswordConfirmation = (string) ($input['new_password_confirmation'] ?? '');

if ($currentPassword === '' || $newPassword === '' || $newPasswordConfirmation === '') {
    json_response([
        'success' => false,
        'message' => 'Current password, new password and confirmation are required'
    ], 422);
}

if ($newPassword !== $newPasswordConfirmation) {
    json_response([
        'success' => false,
        'message' => 'New password confirmation does not match'
    ], 422);
}

if (strlen($newPassword) < 8) {
    json_response([
        'success' => false,
        'message' => 'New password must be at least 8 characters'
    ], 422);
}

if (strlen($newPassword) > 128) {
    json_response([
        'success' => false,
        'message' => 'New password is too long'
    ], 422);
}

$hasLetter = preg_match('/[A-Za-z]/', $newPassword);
$hasNumber = preg_match('/[0-9]/', $newPassword);

if (!$hasLetter || !$hasNumber) {
    json_response([
        'success' => false,
        'message' => 'New password must contain at least one letter and one number'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        SELECT id, password_hash
        FROM users
        WHERE id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $user['id'],
    ]);

    $dbUser = $stmt->fetch();

    if (!$dbUser) {
        json_response([
            'success' => false,
            'message' => 'User not found'
        ], 404);
    }

    if (!password_verify($currentPassword, $dbUser['password_hash'])) {
        json_response([
            'success' => false,
            'message' => 'Current password is incorrect'
        ], 401);
    }

    if (password_verify($newPassword, $dbUser['password_hash'])) {
        json_response([
            'success' => false,
            'message' => 'New password must be different from current password'
        ], 422);
    }

    $newPasswordHash = password_hash($newPassword, PASSWORD_DEFAULT);

    $updateStmt = $pdo->prepare("
        UPDATE users
        SET
            password_hash = :password_hash,
            token_version = token_version + 1,
            must_change_password = 0,
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = :id
        LIMIT 1
    ");

    $updateStmt->execute([
        ':password_hash' => $newPasswordHash,
        ':id' => $user['id'],
    ]);

    auth_revoke_sessions($pdo, (int) $user['id'], (int) $user['id'], 'Password changed');

    clear_rate_limit(
        $pdo,
        'auth_change_password',
        rate_limit_identifier('user:' . $user['id'] . '|ip:' . $clientIp)
    );

    json_response([
        'success' => true,
        'message' => 'Password changed successfully. Please login again.'
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS_CHANGE_PASSWORD] ' . $e->getMessage());

    $response = [
        'success' => false,
        'message' => 'Failed to change password',
    ];

    if (app_debug_enabled()) {
        $response['error'] = $e->getMessage();
    }

    json_response($response, 500);
}