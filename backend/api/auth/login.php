<?php

// مسیر فایل: ai-chat-saas/backend/api/auth/login.php
// هدف: ورود کاربران پنل و تولید توکن JWT امن‌تر

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/jwt.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$input = get_json_input();

$email = trim((string) ($input['email'] ?? ''));
$password = (string) ($input['password'] ?? '');
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

$ipLoginIdentifier = rate_limit_identifier('ip:' . $clientIp);

enforce_rate_limit(
    $pdo,
    'auth_login_ip',
    $ipLoginIdentifier,
    30,
    15 * 60,
    'Too many login attempts from this IP. Please try again later.'
);

if ($email === '' || $password === '') {
    json_response([
        'success' => false,
        'message' => 'Email and password are required'
    ], 422);
}

$email = strtolower($email);

if (strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response([
        'success' => false,
        'message' => 'Invalid email or password'
    ], 401);
}

$accountLoginIdentifier = rate_limit_identifier('email:' . $email . '|ip:' . $clientIp);

enforce_rate_limit(
    $pdo,
    'auth_login_account',
    $accountLoginIdentifier,
    8,
    15 * 60,
    'Too many login attempts. Please try again later.'
);

try {
    $stmt = $pdo->prepare("
        SELECT 
            users.id,
            users.tenant_id,
            users.name,
            users.email,
            users.password_hash,
            users.role,
            users.is_active,
            users.token_version,
            tenants.status AS tenant_status
        FROM users
        LEFT JOIN tenants ON tenants.id = users.tenant_id
        WHERE users.email = :email
        LIMIT 1
    ");

    $stmt->execute([
        ':email' => $email
    ]);

    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response([
            'success' => false,
            'message' => 'Invalid email or password'
        ], 401);
    }

    if ((int) $user['is_active'] !== 1) {
        json_response([
            'success' => false,
            'message' => 'User account is inactive'
        ], 403);
    }

    if ($user['role'] !== 'super_admin') {
        if (!$user['tenant_id']) {
            json_response([
                'success' => false,
                'message' => 'User is not assigned to a customer account'
            ], 403);
        }

        if ($user['tenant_status'] !== 'active') {
            json_response([
                'success' => false,
                'message' => 'Customer account is not active'
            ], 403);
        }
    }

    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        $rehashStmt = $pdo->prepare("
            UPDATE users
            SET password_hash = :password_hash
            WHERE id = :id
        ");

        $rehashStmt->execute([
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ':id' => (int) $user['id'],
        ]);
    }

    $now = time();
    $jwtExpirationSeconds = (int) app_config('jwt_expiration_seconds', 604800);

    if ($jwtExpirationSeconds <= 0) {
        $jwtExpirationSeconds = 604800;
    }

    $payload = [
        'iss' => (string) app_config('jwt_issuer', 'ai-chat-saas'),
        'aud' => (string) app_config('jwt_audience', 'ai-chat-saas-panel'),
        'sub' => (int) $user['id'],
        'tenant_id' => $user['tenant_id'] !== null ? (int) $user['tenant_id'] : null,
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'token_version' => (int) $user['token_version'],
        'jti' => bin2hex(random_bytes(16)),
        'iat' => $now,
        'nbf' => $now - 5,
        'exp' => $now + $jwtExpirationSeconds,
    ];

    $token = jwt_encode($payload);

    $updateStmt = $pdo->prepare("
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':id' => (int) $user['id']
    ]);

    clear_rate_limit($pdo, 'auth_login_ip', $ipLoginIdentifier);
    clear_rate_limit($pdo, 'auth_login_account', $accountLoginIdentifier);

    json_response([
        'success' => true,
        'message' => 'Login successful',
        'token' => $token,
        'user' => [
            'id' => (int) $user['id'],
            'tenant_id' => $user['tenant_id'] !== null ? (int) $user['tenant_id'] : null,
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
        ]
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS_AUTH_LOGIN] ' . $e->getMessage());

    $response = [
        'success' => false,
        'message' => 'Login failed',
    ];

    if (app_debug_enabled()) {
        $response['error'] = $e->getMessage();
    }

    json_response($response, 500);
}