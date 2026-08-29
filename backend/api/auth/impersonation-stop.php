<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
if (empty($user['is_impersonating']) || empty($user['impersonation_id'])) {
    json_response(['success' => false, 'message' => 'این نشست ورود موقت نیست.'], 422);
}

try {
    $stmt = $pdo->prepare(
        "SELECT ai.*,admin.name AS admin_name,admin.email AS admin_email,target.name AS target_name
         FROM admin_impersonations ai
         INNER JOIN users admin ON admin.id=ai.admin_user_id
         INNER JOIN users target ON target.id=ai.target_user_id
         WHERE ai.id=:id
         LIMIT 1"
    );
    $stmt->execute([':id' => (int) $user['impersonation_id']]);
    $row = $stmt->fetch();

    $pdo->beginTransaction();
    $pdo->prepare(
        "UPDATE auth_sessions
         SET revoked_at=NOW(),revoked_by=:revoked_by,revocation_reason='Impersonation ended'
         WHERE user_id=:session_user_id
           AND jti_hash=:jti_hash
           AND revoked_at IS NULL"
    )->execute([
        ':revoked_by' => (int) $user['impersonator_user_id'],
        ':session_user_id' => (int) $user['id'],
        ':jti_hash' => hash('sha256', (string) $user['session_jti']),
    ]);

    $pdo->prepare(
        "UPDATE admin_impersonations
         SET status='ended',ended_at=NOW(),ended_by=:ended_by
         WHERE id=:impersonation_id AND status='active'"
    )->execute([
        ':ended_by' => (int) $user['impersonator_user_id'],
        ':impersonation_id' => (int) $user['impersonation_id'],
    ]);
    $pdo->commit();
    auth_clear_session_cookies(true);

    if ($row) {
        $actor = [
            'id' => (int) $row['admin_user_id'],
            'name' => $row['admin_name'],
            'email' => $row['admin_email'],
            'role' => 'super_admin',
        ];
        try {
            admin_audit_log(
                $pdo,
                $actor,
                'customer.impersonation_ended',
                'tenant',
                (int) $row['tenant_id'],
                'ورود موقت به حساب «' . $row['target_name'] . '» پایان یافت.',
                null,
                ['target_user_id' => (int) $row['target_user_id']],
                [
                    'tenant_id' => (int) $row['tenant_id'],
                    'target_user_id' => (int) $row['target_user_id'],
                ]
            );
        } catch (Throwable $auditError) {
            error_log('[IMPERSONATION_STOP_AUDIT] ' . $auditError->getMessage());
        }
    }

    json_response(['success' => true, 'message' => 'ورود موقت پایان یافت.']);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $errorId = bin2hex(random_bytes(4));
    error_log('[IMPERSONATION_STOP][' . $errorId . '] ' . $e->getMessage());
    json_response([
        'success' => false,
        'message' => 'پایان ورود موقت ناموفق بود. کد پیگیری: ' . $errorId,
        'error_code' => 'IMPERSONATION_STOP_FAILED',
    ], 500);
}
