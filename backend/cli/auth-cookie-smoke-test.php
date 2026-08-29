<?php

// End-to-end smoke test for HttpOnly session cookies and CSRF enforcement.

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth-cookie.php';
require_once __DIR__ . '/../includes/auth-session.php';

if (app_is_production()) {
    fwrite(STDERR, "Refusing to create a synthetic login fixture in production.\n");
    exit(2);
}

function auth_cookie_smoke_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function auth_cookie_smoke_request(
    string $method,
    string $url,
    ?array $payload,
    array &$cookies,
    array $extraHeaders = []
): array {
    $responseHeaders = [];
    $headers = array_merge([
        'Accept: application/json',
        'Content-Type: application/json',
        'Origin: ' . (string) app_config('frontend_url', 'http://localhost:3000'),
    ], $extraHeaders);
    if ($cookies !== []) {
        $headers[] = 'Cookie: ' . implode('; ', array_map(
            static fn(string $name, string $value): string => $name . '=' . $value,
            array_keys($cookies),
            array_values($cookies)
        ));
    }

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HEADERFUNCTION => static function ($curlHandle, string $line) use (&$cookies, &$responseHeaders): int {
            $responseHeaders[] = trim($line);
            if (stripos($line, 'Set-Cookie:') === 0) {
                $cookiePair = trim(explode(';', trim(substr($line, strlen('Set-Cookie:'))), 2)[0]);
                [$name, $value] = array_pad(explode('=', $cookiePair, 2), 2, '');
                if ($value === '') {
                    unset($cookies[$name]);
                } else {
                    $cookies[$name] = $value;
                }
            }
            return strlen($line);
        },
    ]);
    if ($payload !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }
    $body = curl_exec($curl);
    if ($body === false) {
        throw new RuntimeException('HTTP request failed: ' . curl_error($curl));
    }
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    return [
        'status' => $status,
        'headers' => $responseHeaders,
        'data' => json_decode((string) $body, true, 512, JSON_THROW_ON_ERROR),
    ];
}

$suffix = substr(bin2hex(random_bytes(8)), 0, 12);
$email = 'cookie-' . $suffix . '@example.invalid';
$password = 'Cookie!' . bin2hex(random_bytes(10));
$tenantId = 0;
$targetUserId = 0;
$adminUserId = 0;
$impersonationId = 0;

try {
    $pdo->prepare("INSERT INTO tenants(name,owner_name,owner_email,status) VALUES(:name,:owner,:email,'active')")
        ->execute([':name'=>'Cookie Smoke ' . $suffix, ':owner'=>'Cookie Smoke', ':email'=>$email]);
    $tenantId = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO users(tenant_id,name,email,password_hash,role,is_active) VALUES(:tenant,:name,:email,:password,'customer_admin',1)")
        ->execute([
            ':tenant'=>$tenantId,
            ':name'=>'Cookie Smoke User',
            ':email'=>$email,
            ':password'=>password_hash($password, PASSWORD_DEFAULT),
        ]);
    $targetUserId = (int) $pdo->lastInsertId();

    $baseUrl = rtrim((string) app_config('api_url', 'http://localhost/ai-chat-saas/backend/api'), '/');
    $invalidCookies = [];
    $invalidLogin = auth_cookie_smoke_request('POST', $baseUrl . '/auth/login.php', [
        'email' => $email,
        'password' => $password . '-invalid',
    ], $invalidCookies);
    auth_cookie_smoke_assert($invalidLogin['status'] === 401, 'Invalid password did not return HTTP 401.');
    $attemptStmt = $pdo->prepare('SELECT failed_login_attempts,locked_until FROM users WHERE id=:id LIMIT 1');
    $attemptStmt->execute([':id'=>$targetUserId]);
    $attemptState = $attemptStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    auth_cookie_smoke_assert((int)($attemptState['failed_login_attempts'] ?? 0) === 1, 'Invalid password attempt was not recorded.');
    auth_cookie_smoke_assert(empty($attemptState['locked_until']), 'Single invalid password attempt unexpectedly locked the account.');

    $cookies = [];
    $login = auth_cookie_smoke_request('POST', $baseUrl . '/auth/login.php', [
        'email' => $email,
        'password' => $password,
    ], $cookies);
    $sessionCookie = auth_session_cookie_name();
    $csrfCookie = auth_csrf_cookie_name();
    auth_cookie_smoke_assert($login['status'] === 200, 'Login did not return HTTP 200.');
    auth_cookie_smoke_assert(!array_key_exists('token', $login['data']), 'Login exposed the access token in JSON.');
    auth_cookie_smoke_assert(isset($cookies[$sessionCookie], $cookies[$csrfCookie]), 'Session or CSRF cookie was not issued.');
    auth_cookie_smoke_assert(($login['data']['csrf_token'] ?? null) === $cookies[$csrfCookie], 'CSRF response and cookie do not match.');
    $sessionHeader = implode("\n", array_filter(
        $login['headers'],
        static fn(string $line): bool => stripos($line, 'Set-Cookie: ' . $sessionCookie . '=') === 0
    ));
    auth_cookie_smoke_assert(stripos($sessionHeader, 'HttpOnly') !== false, 'Session cookie is not HttpOnly.');
    auth_cookie_smoke_assert(stripos($sessionHeader, 'SameSite=') !== false, 'Session cookie has no SameSite attribute.');

    $me = auth_cookie_smoke_request('GET', $baseUrl . '/auth/me.php', null, $cookies);
    auth_cookie_smoke_assert($me['status'] === 200 && ($me['data']['user']['email'] ?? '') === $email, 'Cookie-authenticated /me request failed.');

    $blocked = auth_cookie_smoke_request('POST', $baseUrl . '/auth/logout-current.php', [], $cookies);
    auth_cookie_smoke_assert(
        $blocked['status'] === 403,
        'State-changing request without CSRF was not rejected (HTTP ' . $blocked['status'] . ', code ' . ($blocked['data']['code'] ?? 'none') . ').'
    );

    $logout = auth_cookie_smoke_request('POST', $baseUrl . '/auth/logout-current.php', [], $cookies, [
        'X-CSRF-Token: ' . $login['data']['csrf_token'],
    ]);
    auth_cookie_smoke_assert($logout['status'] === 200, 'Logout with a valid CSRF token failed.');

    $expired = auth_cookie_smoke_request('GET', $baseUrl . '/auth/me.php', null, $cookies);
    auth_cookie_smoke_assert($expired['status'] === 401, 'Revoked session remained usable after logout.');

    $ownerRoleId = (int) $pdo->query("SELECT id FROM admin_roles WHERE code='owner' AND is_active=1 LIMIT 1")->fetchColumn();
    auth_cookie_smoke_assert($ownerRoleId > 0, 'Active owner role is required for impersonation smoke test.');
    $adminEmail = 'cookie-admin-' . $suffix . '@example.invalid';
    $pdo->prepare("INSERT INTO users(tenant_id,name,email,password_hash,role,admin_role_id,is_active) VALUES(NULL,:name,:email,:password,'super_admin',:role,1)")
        ->execute([
            ':name'=>'Cookie Smoke Admin',
            ':email'=>$adminEmail,
            ':password'=>password_hash($password, PASSWORD_DEFAULT),
            ':role'=>$ownerRoleId,
        ]);
    $adminUserId = (int) $pdo->lastInsertId();
    $pdo->prepare(
        "INSERT INTO admin_impersonations(admin_user_id,target_user_id,tenant_id,reason,ticket_hash,status,started_at,ticket_expires_at,used_at,expires_at)
         VALUES(:admin,:target,:tenant,'Cookie smoke test',:ticket,'active',NOW(),DATE_ADD(NOW(),INTERVAL 5 MINUTE),NOW(),DATE_ADD(NOW(),INTERVAL 10 MINUTE))"
    )->execute([
        ':admin'=>$adminUserId,
        ':target'=>$targetUserId,
        ':tenant'=>$tenantId,
        ':ticket'=>hash('sha256', random_bytes(32)),
    ]);
    $impersonationId = (int) $pdo->lastInsertId();
    $targetStmt = $pdo->prepare('SELECT * FROM users WHERE id=:id LIMIT 1');
    $targetStmt->execute([':id'=>$targetUserId]);
    $targetUser = $targetStmt->fetch();
    auth_cookie_smoke_assert((bool) $targetUser, 'Impersonation target could not be loaded.');
    $impersonationSession = auth_issue_session($pdo, $targetUser, [
        'impersonation_id'=>$impersonationId,
        'impersonator_user_id'=>$adminUserId,
        'impersonator_name'=>'Cookie Smoke Admin',
        'expires_at'=>date('Y-m-d H:i:s', time() + 600),
    ]);
    $pdo->prepare('UPDATE admin_impersonations SET target_session_id=:session WHERE id=:id')
        ->execute([':session'=>$impersonationSession['session_id'], ':id'=>$impersonationId]);
    $impersonationCsrf = bin2hex(random_bytes(32));
    $cookies = [
        auth_session_cookie_name(true) => $impersonationSession['token'],
        auth_csrf_cookie_name(true) => $impersonationCsrf,
    ];
    $contextHeader = ['X-Auth-Context: impersonation'];
    $impersonatedMe = auth_cookie_smoke_request('GET', $baseUrl . '/auth/me.php', null, $cookies, $contextHeader);
    auth_cookie_smoke_assert(
        $impersonatedMe['status'] === 200
        && !empty($impersonatedMe['data']['user']['is_impersonating'])
        && (int) ($impersonatedMe['data']['user']['impersonation_id'] ?? 0) === $impersonationId,
        'Impersonation claims were not restored from the secure cookie session.'
    );
    $stop = auth_cookie_smoke_request('POST', $baseUrl . '/auth/impersonation-stop.php', [], $cookies, [
        ...$contextHeader,
        'X-CSRF-Token: ' . $impersonationCsrf,
    ]);
    auth_cookie_smoke_assert($stop['status'] === 200, 'Impersonation stop failed with valid context and CSRF.');
    $statusStmt = $pdo->prepare('SELECT status FROM admin_impersonations WHERE id=:id');
    $statusStmt->execute([':id'=>$impersonationId]);
    auth_cookie_smoke_assert($statusStmt->fetchColumn() === 'ended', 'Impersonation row was not closed.');

    echo "auth_cookie_smoke=passed\n";
} finally {
    if ($adminUserId > 0) {
        $pdo->prepare('DELETE FROM admin_audit_logs WHERE actor_user_id=:admin')->execute([':admin'=>$adminUserId]);
    }
    if ($impersonationId > 0) {
        $pdo->prepare('DELETE FROM admin_impersonations WHERE id=:id')->execute([':id'=>$impersonationId]);
    }
    if ($adminUserId > 0) {
        $pdo->prepare('DELETE FROM users WHERE id=:admin')->execute([':admin'=>$adminUserId]);
    }
    if ($tenantId > 0) {
        $pdo->prepare('DELETE FROM users WHERE tenant_id=:tenant')->execute([':tenant'=>$tenantId]);
        $pdo->prepare('DELETE FROM tenants WHERE id=:tenant')->execute([':tenant'=>$tenantId]);
    }
}
