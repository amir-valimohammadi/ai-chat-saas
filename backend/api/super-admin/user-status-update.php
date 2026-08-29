<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/user-status-update.php
// هدف: فعال یا غیرفعال کردن کاربر، لغو نشست‌ها و ثبت Audit Log

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

if (!array_key_exists('is_active', $input)) {
    json_response([
        'success' => false,
        'message' => 'is_active is required',
    ], 422);
}

$isActive = filter_var(
    $input['is_active'],
    FILTER_VALIDATE_BOOLEAN,
    FILTER_NULL_ON_FAILURE
);

if ($userId <= 0) {
    json_response([
        'success' => false,
        'message' => 'user_id is required',
    ], 422);
}

if ($isActive === null) {
    json_response([
        'success' => false,
        'message' => 'Invalid is_active value',
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
            is_active,
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

    $previousState = (bool) $targetUser['is_active'];

    if ($previousState !== $isActive) {
        $pdo->beginTransaction();

        $updateStmt = $pdo->prepare("
            UPDATE users
            SET
                is_active = :is_active,
                availability_status = CASE
                    WHEN :is_active_for_status = 0 THEN 'offline'
                    ELSE availability_status
                END,
                token_version = token_version + 1
            WHERE id = :user_id
              AND role IN ('customer_admin', 'agent')
        ");

        $updateStmt->execute([
            ':is_active' => $isActive ? 1 : 0,
            ':is_active_for_status' => $isActive ? 1 : 0,
            ':user_id' => $userId,
        ]);

        auth_revoke_sessions($pdo, (int) $userId, (int) $user['id'], 'User status changed by platform administrator');

        admin_audit_log(
            $pdo,
            $user,
            'user.status_changed',
            'user',
            $userId,
            sprintf(
                'وضعیت کاربر «%s» از %s به %s تغییر کرد و نشست‌های قبلی لغو شد.',
                $targetUser['name'],
                $previousState ? 'فعال' : 'غیرفعال',
                $isActive ? 'فعال' : 'غیرفعال'
            ),
            [
                'is_active' => $previousState,
                'token_version' => (int) $targetUser['token_version'],
            ],
            [
                'is_active' => $isActive,
                'sessions_revoked' => true,
                'token_version_incremented' => true,
            ],
            [
                'tenant_id' => (int) $targetUser['tenant_id'],
                'target_user_id' => $userId,
            ]
        );

        $pdo->commit();
    }

    json_response([
        'success' => true,
        'message' => $previousState === $isActive
            ? 'User status was already up to date'
            : 'User status updated',
        'user' => [
            'id' => (int) $targetUser['id'],
            'tenant_id' => (int) $targetUser['tenant_id'],
            'name' => $targetUser['name'],
            'email' => $targetUser['email'],
            'role' => $targetUser['role'],
            'previous_is_active' => $previousState,
            'is_active' => $isActive,
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log(
        '[AI_CHAT_SAAS] user-status-update failed: ' . $e->getMessage()
    );

    $payload = [
        'success' => false,
        'message' => 'Failed to update user status',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
