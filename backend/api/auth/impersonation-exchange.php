<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth-session.php';
require_once __DIR__ . '/../../includes/admin-audit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$ticket = trim((string) ($input['ticket'] ?? ''));
if (!preg_match('/^[a-f0-9]{64}$/', $ticket)) {
    json_response(['success' => false, 'message' => 'Ticket ورود موقت معتبر نیست.'], 422);
}
$hash = hash('sha256', $ticket);

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        "SELECT ai.*,
                admin.name AS admin_name,admin.email AS admin_email,
                admin.is_active AS admin_is_active,admin.role AS admin_role,
                target.id AS user_id,target.tenant_id,target.name,target.email,target.phone,
                target.role,target.token_version,target.must_change_password,
                target.two_factor_enabled,target.is_active,
                t.status AS tenant_status
         FROM admin_impersonations ai
         INNER JOIN users admin ON admin.id=ai.admin_user_id
         INNER JOIN users target ON target.id=ai.target_user_id
         INNER JOIN tenants t ON t.id=ai.tenant_id AND t.id=target.tenant_id
         WHERE ai.ticket_hash=:hash
         LIMIT 1
         FOR UPDATE"
    );
    $stmt->execute([':hash' => $hash]);
    $row = $stmt->fetch();

    if (
        !$row ||
        $row['status'] !== 'issued' ||
        $row['used_at'] !== null ||
        strtotime((string) $row['ticket_expires_at']) <= time() ||
        strtotime((string) $row['expires_at']) <= time()
    ) {
        if ($row && $row['status'] === 'issued') {
            $pdo->prepare(
                "UPDATE admin_impersonations
                 SET status='expired',ended_at=COALESCE(ended_at,NOW())
                 WHERE id=:id AND status='issued'"
            )->execute([':id' => (int) $row['id']]);
            $pdo->commit();
        } else {
            $pdo->rollBack();
        }
        json_response(['success' => false, 'message' => 'Ticket ورود موقت منقضی یا استفاده شده است.'], 410);
    }

    if (!(bool) $row['admin_is_active'] || $row['admin_role'] !== 'super_admin') {
        $pdo->prepare(
            "UPDATE admin_impersonations
             SET status='revoked',ended_at=NOW()
             WHERE id=:id AND status='issued'"
        )->execute([':id' => (int) $row['id']]);
        $pdo->commit();
        json_response(['success' => false, 'message' => 'مجوز مدیر صادرکننده دیگر معتبر نیست.'], 403);
    }

    if (!(bool) $row['is_active'] || $row['tenant_status'] !== 'active') {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'حساب هدف فعال نیست.'], 403);
    }

    $consumeTicket = $pdo->prepare(
        "UPDATE admin_impersonations
         SET status='active',started_at=NOW(),used_at=NOW()
         WHERE id=:id AND status='issued' AND used_at IS NULL"
    );
    $consumeTicket->execute([':id' => (int) $row['id']]);
    if ($consumeTicket->rowCount() !== 1) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'Ticket ورود موقت قبلاً استفاده شده است.'], 410);
    }

    // ai.* contains its own `id`; never pass the raw joined row to
    // auth_issue_session(), otherwise the impersonation record id becomes
    // the JWT subject instead of the selected customer user id.
    $targetUser = [
        'id' => (int) $row['user_id'],
        'tenant_id' => (int) $row['tenant_id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'phone' => $row['phone'] ?? null,
        'role' => $row['role'],
        'token_version' => (int) $row['token_version'],
        'must_change_password' => (int) ($row['must_change_password'] ?? 0),
        'two_factor_enabled' => (int) ($row['two_factor_enabled'] ?? 0),
    ];

    $session = auth_issue_session($pdo, $targetUser, [
        'impersonation_id' => (int) $row['id'],
        'impersonator_user_id' => (int) $row['admin_user_id'],
        'impersonator_name' => $row['admin_name'],
        'expires_at' => $row['expires_at'],
    ]);

    $pdo->prepare(
        'UPDATE admin_impersonations SET target_session_id=:session_id WHERE id=:id'
    )->execute([
        ':session_id' => (int) $session['session_id'],
        ':id' => (int) $row['id'],
    ]);
    $pdo->commit();

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
            'customer.impersonation_started',
            'tenant',
            (int) $row['tenant_id'],
            'ورود موقت به حساب «' . $row['name'] . '» آغاز شد.',
            null,
            ['target_user_id' => (int) $row['target_user_id'], 'expires_at' => $row['expires_at']],
            ['tenant_id' => (int) $row['tenant_id'], 'target_user_id' => (int) $row['target_user_id']]
        );
    } catch (Throwable $auditError) {
        error_log('[IMPERSONATION_EXCHANGE_AUDIT] ' . $auditError->getMessage());
    }

    json_response([
        'success' => true,
        'message' => 'ورود موقت آغاز شد.',
        'token' => $session['token'],
        'expires_at' => $session['expires_at'],
        'user' => $session['user'],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[IMPERSONATION_EXCHANGE] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'ورود موقت ناموفق بود.'], 500);
}
