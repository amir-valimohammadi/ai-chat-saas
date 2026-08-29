<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/user-password-reset.php
// هدف: تغییر رمز، لغو نشست‌ها و ثبت Audit Log بدون ذخیره رمز یا Hash

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/auth-session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$input = get_json_input();

$userId = filter_var(
    $input['user_id'] ?? 0,
    FILTER_VALIDATE_INT,
    [
        'options' => [
            'default' => 0,
            'min_range' => 1,
        ],
    ]
);

$password = is_string($input['password'] ?? null)
    ? $input['password']
    : '';

$passwordLength = function_exists('mb_strlen')
    ? mb_strlen($password, 'UTF-8')
    : strlen($password);

if ($userId <= 0) {
    json_response([
        'success' => false,
        'message' => 'user_id is required',
    ], 422);
}

if ($passwordLength < 8) {
    json_response([
        'success' => false,
        'message' => 'Password must be at least 8 characters',
    ], 422);
}

if ($passwordLength > 128) {
    json_response([
        'success' => false,
        'message' => 'Password must not exceed 128 characters',
    ], 422);
}

try {
    $userStmt = $pdo->prepare("
        SELECT
            id,
            tenant_id,
            name,
            email,
            role,
            token_version
        FROM users
        WHERE id = :user_id
          AND tenant_id IS NOT NULL
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
            'message' => 'User not found',
        ], 404);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    if ($passwordHash === false) {
        throw new RuntimeException('Password hashing failed');
    }

    $pdo->beginTransaction();

    $updateStmt = $pdo->prepare("
        UPDATE users
        SET
            password_hash = :password_hash,
            token_version = token_version + 1
        WHERE id = :user_id
          AND role IN ('customer_admin', 'agent')
    ");

    $updateStmt->execute([
        ':password_hash' => $passwordHash,
        ':user_id' => $userId,
    ]);

    auth_revoke_sessions($pdo, (int) $userId, (int) $user['id'], 'Password reset by platform administrator');

    admin_audit_log(
        $pdo,
        $user,
        'user.password_reset',
        'user',
        $userId,
        sprintf(
            'رمز عبور کاربر «%s» تغییر کرد و تمام نشست‌های قبلی او لغو شد.',
            $targetUser['name']
        ),
        [
            'password_changed' => false,
            'token_version' => (int) $targetUser['token_version'],
        ],
        [
            'password_changed' => true,
            'sessions_revoked' => true,
            'token_version_incremented' => true,
        ],
        [
            'tenant_id' => (int) $targetUser['tenant_id'],
            'target_user_id' => $userId,
        ]
    );

    $pdo->commit();

    json_response([
        'success' => true,
        'message' =>
            'User password updated and active sessions revoked',
        'user' => [
            'id' => (int) $targetUser['id'],
            'tenant_id' => (int) $targetUser['tenant_id'],
            'name' => $targetUser['name'],
            'email' => $targetUser['email'],
            'role' => $targetUser['role'],
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log(
        '[AI_CHAT_SAAS] user-password-reset failed: ' . $e->getMessage()
    );

    $payload = [
        'success' => false,
        'message' => 'Failed to update user password',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
