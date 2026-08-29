<?php

// ورود امن کاربران، ایجاد نشست قابل لغو و آغاز چالش 2FA برای مدیران

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/jwt.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/auth-session.php';
require_once __DIR__ . '/../../includes/security-events.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$email = strtolower(trim((string) ($input['email'] ?? '')));
$password = (string) ($input['password'] ?? '');
$clientIp = auth_client_ip() ?? 'unknown';

$ipIdentifier = rate_limit_identifier('ip:' . $clientIp);
enforce_rate_limit($pdo, 'auth_login_ip', $ipIdentifier, 30, 15 * 60, 'تعداد تلاش ورود از این IP بیش از حد مجاز است.');

if ($email === '' || $password === '') {
    json_response(['success' => false, 'message' => 'ایمیل و رمز عبور الزامی است.'], 422);
}
if (strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['success' => false, 'message' => 'ایمیل یا رمز عبور صحیح نیست.'], 401);
}

$accountIdentifier = rate_limit_identifier('email:' . $email . '|ip:' . $clientIp);
enforce_rate_limit($pdo, 'auth_login_account', $accountIdentifier, 8, 15 * 60, 'تعداد تلاش ورود بیش از حد مجاز است.');

try {
    $stmt = $pdo->prepare("\n        SELECT u.id,u.tenant_id,u.name,u.email,u.phone,u.password_hash,u.role,u.admin_role_id,\n               u.is_active,u.token_version,u.failed_login_attempts,u.locked_until,\n               u.must_change_password,u.two_factor_enabled,u.two_factor_secret_encrypted,\n               u.ip_allowlist_enabled,t.status AS tenant_status\n        FROM users u\n        LEFT JOIN tenants t ON t.id=u.tenant_id\n        WHERE u.email=:email LIMIT 1\n    ");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if ($user && $user['locked_until'] && strtotime((string) $user['locked_until']) > time()) {
        security_log_login_attempt($pdo, (int) $user['id'], $email, false, 'account_locked');
        json_response([
            'success' => false,
            'message' => 'این حساب به‌دلیل تلاش‌های ناموفق موقتاً قفل شده است.',
            'locked_until' => $user['locked_until'],
        ], 423);
    }

    if (!$user || !password_verify($password, (string) $user['password_hash'])) {
        if ($user) {
            $attempts = (int) $user['failed_login_attempts'] + 1;
            $lockThreshold = max(3, (int) app_env('ADMIN_LOGIN_LOCK_THRESHOLD', 5));
            $lockMinutes = max(5, (int) app_env('ADMIN_LOGIN_LOCK_MINUTES', 15));
            $locked = $attempts >= $lockThreshold;
            $lockedUntilSql = $locked
                ? "DATE_ADD(NOW(), INTERVAL {$lockMinutes} MINUTE)"
                : "NULL";
            $update = $pdo->prepare("\n                UPDATE users SET failed_login_attempts=:attempts,\n                    locked_until={$lockedUntilSql}\n                WHERE id=:id\n            ");
            $update->execute([
                ':attempts' => $locked ? 0 : $attempts,
                ':id' => (int) $user['id'],
            ]);
            if ($locked) {
                security_log_event($pdo, (int) $user['id'], 'account_locked', 'critical', 'حساب به‌دلیل ورودهای ناموفق قفل شد', ['email' => $email]);
            }
        }
        security_log_login_attempt($pdo, $user ? (int) $user['id'] : null, $email, false, 'invalid_credentials');
        json_response(['success' => false, 'message' => 'ایمیل یا رمز عبور صحیح نیست.'], 401);
    }

    if ((int) $user['is_active'] !== 1) {
        security_log_login_attempt($pdo, (int) $user['id'], $email, false, 'inactive_account');
        json_response(['success' => false, 'message' => 'حساب کاربری غیرفعال است.'], 403);
    }
    if ($user['role'] !== 'super_admin') {
        if (!$user['tenant_id'] || $user['tenant_status'] !== 'active') {
            security_log_login_attempt($pdo, (int) $user['id'], $email, false, 'inactive_tenant');
            json_response(['success' => false, 'message' => 'حساب مشتری فعال نیست.'], 403);
        }
    } elseif (!empty($user['ip_allowlist_enabled'])) {
        if (!security_admin_ip_allowed($pdo, (int) $user['id'], $clientIp)) {
            security_log_login_attempt($pdo, (int) $user['id'], $email, false, 'ip_not_allowed');
            security_log_event($pdo, (int) $user['id'], 'ip_allowlist_denied', 'critical', 'ورود مدیر از IP غیرمجاز رد شد', ['ip' => $clientIp]);
            json_response(['success' => false, 'message' => 'دسترسی این IP به پنل مدیریت مجاز نیست.'], 403);
        }
    }

    $pdo->prepare('UPDATE users SET failed_login_attempts=0,locked_until=NULL WHERE id=:id')
        ->execute([':id' => (int) $user['id']]);

    if (password_needs_rehash((string) $user['password_hash'], PASSWORD_DEFAULT)) {
        $pdo->prepare('UPDATE users SET password_hash=:hash WHERE id=:id')
            ->execute([':hash' => password_hash($password, PASSWORD_DEFAULT), ':id' => (int) $user['id']]);
    }

    if ($user['role'] === 'super_admin' && !empty($user['two_factor_enabled'])) {
        $now = time();
        $challenge = jwt_encode([
            'purpose' => '2fa_challenge',
            'sub' => (int) $user['id'],
            'email' => $user['email'],
            'token_version' => (int) $user['token_version'],
            'jti' => bin2hex(random_bytes(24)),
            'iat' => $now,
            'nbf' => $now - 5,
            'exp' => $now + 300,
        ]);
        json_response([
            'success' => true,
            'requires_2fa' => true,
            'challenge_token' => $challenge,
            'message' => 'کد ورود دومرحله‌ای را وارد کنید.',
        ]);
    }

    $session = auth_issue_session($pdo, $user);
    $pdo->prepare('UPDATE users SET last_login_at=NOW(),last_login_ip=:ip,last_seen_at=NOW() WHERE id=:id')
        ->execute([':ip' => auth_client_ip(), ':id' => (int) $user['id']]);
    security_log_login_attempt($pdo, (int) $user['id'], $email, true, null);
    clear_rate_limit($pdo, 'auth_login_ip', $ipIdentifier);
    clear_rate_limit($pdo, 'auth_login_account', $accountIdentifier);

    json_response([
        'success' => true,
        'message' => 'ورود موفق بود.',
        'token' => $session['token'],
        'expires_at' => $session['expires_at'],
        'user' => $session['user'],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS_AUTH_LOGIN] ' . $e->getMessage());
    $response = ['success' => false, 'message' => 'ورود ناموفق بود.'];
    if (app_debug_enabled()) {
    }
    json_response($response, 500);
}
