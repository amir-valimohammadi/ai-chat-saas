<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/jwt.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/auth-session.php';
require_once __DIR__ . '/../../includes/security-events.php';
require_once __DIR__ . '/../../includes/totp.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$challengeToken = trim((string) ($input['challenge_token'] ?? ''));
$code = strtoupper(trim((string) ($input['code'] ?? '')));
if ($challengeToken === '' || $code === '') {
    json_response(['success' => false, 'message' => 'چالش و کد امنیتی الزامی است.'], 422);
}

enforce_rate_limit(
    $pdo,
    'auth_2fa_verify',
    rate_limit_identifier('ip:' . (auth_client_ip() ?? 'unknown') . '|challenge:' . hash('sha256', $challengeToken)),
    8,
    10 * 60,
    'تعداد تلاش کد دومرحله‌ای بیش از حد مجاز است.'
);

$payload = jwt_decode($challengeToken);
if (!$payload || ($payload['purpose'] ?? '') !== '2fa_challenge' || empty($payload['sub'])) {
    json_response(['success' => false, 'message' => 'چالش دومرحله‌ای منقضی یا نامعتبر است.'], 401);
}

$stmt = $pdo->prepare("\n    SELECT id,tenant_id,name,email,phone,role,is_active,token_version,must_change_password,\n           two_factor_enabled,two_factor_secret_encrypted,ip_allowlist_enabled\n    FROM users WHERE id=:id AND role='super_admin' LIMIT 1\n");
$stmt->execute([':id' => (int) $payload['sub']]);
$user = $stmt->fetch();
if (!$user || !(int) $user['is_active'] || !(int) $user['two_factor_enabled'] || (int) $payload['token_version'] !== (int) $user['token_version']) {
    json_response(['success' => false, 'message' => 'چالش دومرحله‌ای معتبر نیست.'], 401);
}

$ip = auth_client_ip() ?? 'unknown';
if (!empty($user['ip_allowlist_enabled']) && !security_admin_ip_allowed($pdo, (int) $user['id'], $ip)) {
    security_log_event($pdo, (int) $user['id'], 'ip_allowlist_denied', 'critical', 'تأیید 2FA از IP غیرمجاز رد شد', ['ip' => $ip]);
    json_response(['success' => false, 'message' => 'دسترسی این IP به پنل مدیریت مجاز نیست.'], 403);
}

$secret = security_decrypt_secret((string) $user['two_factor_secret_encrypted']);
$valid = $secret !== '' && totp_verify($secret, $code);
$usedRecovery = false;

if (!$valid && preg_match('/^[A-F0-9]{8}$/', $code)) {
    $hash = hash('sha256', $code);
    $recovery = $pdo->prepare("\n        SELECT id FROM admin_two_factor_recovery_codes\n        WHERE user_id=:user_id AND code_hash=:code_hash AND used_at IS NULL LIMIT 1\n    ");
    $recovery->execute([':user_id' => (int) $user['id'], ':code_hash' => $hash]);
    $recoveryId = $recovery->fetchColumn();
    if ($recoveryId) {
        $pdo->prepare('UPDATE admin_two_factor_recovery_codes SET used_at=NOW() WHERE id=:id')
            ->execute([':id' => (int) $recoveryId]);
        $valid = true;
        $usedRecovery = true;
    }
}

if (!$valid) {
    security_log_login_attempt($pdo, (int) $user['id'], (string) $user['email'], false, 'invalid_2fa');
    security_log_event($pdo, (int) $user['id'], 'two_factor_failed', 'warning', 'کد ورود دومرحله‌ای نامعتبر بود');
    json_response(['success' => false, 'message' => 'کد امنیتی صحیح نیست.'], 401);
}

$session = auth_issue_session($pdo, $user);
$pdo->prepare('UPDATE users SET last_login_at=NOW(),last_login_ip=:ip,last_seen_at=NOW(),failed_login_attempts=0,locked_until=NULL WHERE id=:id')
    ->execute([':ip' => auth_client_ip(), ':id' => (int) $user['id']]);
security_log_login_attempt($pdo, (int) $user['id'], (string) $user['email'], true, null);
if ($usedRecovery) {
    security_log_event($pdo, (int) $user['id'], 'recovery_code_used', 'warning', 'ورود با کد بازیابی انجام شد');
}

json_response([
    'success' => true,
    'message' => 'ورود موفق بود.',
    'token' => $session['token'],
    'expires_at' => $session['expires_at'],
    'user' => $session['user'],
]);
