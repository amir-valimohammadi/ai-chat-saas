<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-access.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/auth-session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();
require_sensitive_confirmation($pdo, $user, $input);

$tenantId = filter_var(
    $input['tenant_id'] ?? 0,
    FILTER_VALIDATE_INT,
    ['options' => ['default' => 0, 'min_range' => 1]]
);
$targetUserId = filter_var(
    $input['target_user_id'] ?? 0,
    FILTER_VALIDATE_INT,
    ['options' => ['default' => 0, 'min_range' => 1]]
);
$reason = trim((string) ($input['reason'] ?? ''));
$reasonLength = function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') : strlen($reason);

if ($tenantId <= 0 || $targetUserId <= 0 || $reasonLength < 5 || $reasonLength > 1000) {
    json_response(['success' => false, 'message' => 'کاربر هدف و دلیل ورود موقت الزامی است.'], 422);
}

$ticketTtlSeconds = max(60, min(300, (int) app_env('ADMIN_IMPERSONATION_TICKET_SECONDS', 120)));
$sessionTtlMinutes = max(5, min(120, (int) app_env('ADMIN_IMPERSONATION_TTL_MINUTES', 30)));

try {
    $stmt = $pdo->prepare(
        "SELECT u.id,u.name,u.email,u.role,u.is_active,u.tenant_id,
                t.name AS tenant_name,t.status AS tenant_status
         FROM users u
         INNER JOIN tenants t ON t.id=u.tenant_id
         WHERE u.id=:user_id
           AND u.tenant_id=:tenant_id
           AND u.role IN ('customer_admin','agent')
         LIMIT 1"
    );
    $stmt->execute([':user_id' => $targetUserId, ':tenant_id' => $tenantId]);
    $target = $stmt->fetch();
    if (!$target) {
        json_response(['success' => false, 'message' => 'کاربر هدف پیدا نشد.'], 404);
    }
    if (!(bool) $target['is_active'] || $target['tenant_status'] !== 'active') {
        json_response(['success' => false, 'message' => 'حساب مشتری یا کاربر هدف فعال نیست.'], 422);
    }

    $pdo->beginTransaction();

    // هر Ticket استفاده‌نشده قبلی همین مدیر برای همین کاربر باطل می‌شود.
    // Placeholderهای تکراری در PDO با Native Prepare معتبر نیستند.
    $pdo->prepare(
        "UPDATE admin_impersonations
         SET status='revoked', ended_at=NOW(), ended_by=:ended_by
         WHERE admin_user_id=:admin_user_id
           AND target_user_id=:target_user_id
           AND status='issued'"
    )->execute([
        ':ended_by' => (int) $user['id'],
        ':admin_user_id' => (int) $user['id'],
        ':target_user_id' => $targetUserId,
    ]);

    $ticket = bin2hex(random_bytes(32));
    $ticketHash = hash('sha256', $ticket);
    $ticketExpires = date('Y-m-d H:i:s', time() + $ticketTtlSeconds);
    $expires = date('Y-m-d H:i:s', time() + ($sessionTtlMinutes * 60));

    $insert = $pdo->prepare(
        "INSERT INTO admin_impersonations(
            admin_user_id,target_user_id,tenant_id,reason,ticket_hash,status,
            ticket_expires_at,expires_at,ip_address,user_agent
         ) VALUES(
            :admin,:target,:tenant,:reason,:ticket,'issued',
            :ticket_expires,:expires,:ip,:ua
         )"
    );
    $insert->execute([
        ':admin' => (int) $user['id'],
        ':target' => $targetUserId,
        ':tenant' => $tenantId,
        ':reason' => $reason,
        ':ticket' => $ticketHash,
        ':ticket_expires' => $ticketExpires,
        ':expires' => $expires,
        ':ip' => auth_client_ip(),
        ':ua' => auth_user_agent(),
    ]);
    $id = (int) $pdo->lastInsertId();
    $pdo->commit();

    // شکست Audit نباید Ticket معتبر را از کاربر پنهان کند.
    try {
        admin_audit_log(
            $pdo,
            $user,
            'customer.impersonation_issued',
            'tenant',
            $tenantId,
            'ورود موقت به حساب «' . $target['name'] . '» برای مشتری «' . $target['tenant_name'] . '» صادر شد.',
            null,
            ['target_user_id' => $targetUserId, 'reason' => $reason, 'expires_at' => $expires],
            ['tenant_id' => $tenantId, 'target_user_id' => $targetUserId]
        );
    } catch (Throwable $auditError) {
        error_log('[IMPERSONATION_START_AUDIT] ' . $auditError->getMessage());
    }

    json_response([
        'success' => true,
        'message' => 'مجوز ورود موقت صادر شد.',
        'ticket' => $ticket,
        'ticket_expires_at' => $ticketExpires,
        'expires_at' => $expires,
        'target_user' => [
            'id' => (int) $target['id'],
            'name' => $target['name'],
            'email' => $target['email'],
            'role' => $target['role'],
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $errorId = bin2hex(random_bytes(4));
    error_log('[IMPERSONATION_START][' . $errorId . '] ' . $e->getMessage());

    $message = 'ایجاد ورود موقت ناموفق بود. کد پیگیری: ' . $errorId;
    if ($e instanceof PDOException && in_array((string) $e->getCode(), ['42S02', '42S22'], true)) {
        $message = 'ساختار دیتابیس ورود موقت کامل نیست. Migration فاز ۳ را دوباره بررسی کن.';
    }

    json_response([
        'success' => false,
        'message' => $message,
        'error_code' => 'IMPERSONATION_START_FAILED',
    ], 500);
}
