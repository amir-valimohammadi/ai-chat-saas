<?php

// مسیر فایل: ai-chat-saas/backend/includes/auth.php
// هدف: بررسی JWT، نشست فعال و دسترسی‌های نقش مدیریتی

declare(strict_types=1);

require_once __DIR__ . '/response.php';
require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/auth-session.php';
require_once __DIR__ . '/admin-access.php';
require_once __DIR__ . '/security-events.php';

if (!function_exists('get_authorization_header')) {
    function get_authorization_header(): ?string
    {
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            return $_SERVER['HTTP_AUTHORIZATION'];
        }
        if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        if (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            if (isset($headers['Authorization'])) {
                return $headers['Authorization'];
            }
            if (isset($headers['authorization'])) {
                return $headers['authorization'];
            }
        }
        return null;
    }
}

if (!function_exists('get_bearer_token')) {
    function get_bearer_token(): ?string
    {
        $header = get_authorization_header();
        if (!$header || !preg_match('/^\s*Bearer\s+([A-Za-z0-9\-_\.]+)\s*$/i', $header, $matches)) {
            return null;
        }
        return strlen($matches[1]) <= 4096 ? $matches[1] : null;
    }
}

if (!function_exists('require_auth')) {
    function require_auth(PDO $pdo): array
    {
        $token = get_bearer_token();
        if (!$token) {
            json_response(['success' => false, 'message' => 'Authorization token is required'], 401);
        }

        try {
            $payload = jwt_decode($token);
        } catch (Throwable $e) {
            error_log('[AI_CHAT_SAAS_SECURITY] JWT decode failed: ' . $e->getMessage());
            json_response(['success' => false, 'message' => 'Authentication is temporarily unavailable'], 500);
        }

        if (!$payload || !isset($payload['sub'], $payload['exp'], $payload['iat'], $payload['jti'], $payload['token_version'])) {
            json_response(['success' => false, 'message' => 'Invalid or expired token'], 401);
        }

        if (($payload['purpose'] ?? 'access') !== 'access') {
            json_response(['success' => false, 'message' => 'Invalid authentication token'], 401);
        }

        $userId = (int) $payload['sub'];
        if ($userId <= 0 || !auth_validate_session($pdo, $userId, (string) $payload['jti'])) {
            json_response(['success' => false, 'message' => 'Session has expired or been revoked'], 401);
        }

        $stmt = $pdo->prepare("\n            SELECT\n                users.id, users.tenant_id, users.name, users.email, users.phone, users.role,\n                users.admin_role_id, users.is_active, users.token_version,\n                users.must_change_password, users.two_factor_enabled, users.ip_allowlist_enabled,\n                users.locked_until, tenants.name AS tenant_name, tenants.status AS tenant_status\n            FROM users\n            LEFT JOIN tenants ON tenants.id = users.tenant_id\n            WHERE users.id = :id\n            LIMIT 1\n        ");
        $stmt->execute([':id' => $userId]);
        $dbUser = $stmt->fetch();

        if (!$dbUser) {
            json_response(['success' => false, 'message' => 'User not found'], 401);
        }
        if ((int) $dbUser['is_active'] !== 1) {
            json_response(['success' => false, 'message' => 'User account is inactive'], 403);
        }
        if ((int) $payload['token_version'] !== (int) $dbUser['token_version']) {
            json_response(['success' => false, 'message' => 'Token has been revoked'], 401);
        }
        if (isset($payload['email']) && $payload['email'] !== $dbUser['email']) {
            json_response(['success' => false, 'message' => 'Token has been revoked'], 401);
        }
        if (isset($payload['role']) && $payload['role'] !== $dbUser['role']) {
            json_response(['success' => false, 'message' => 'Token has been revoked'], 401);
        }

        if ($dbUser['role'] !== 'super_admin') {
            if (!$dbUser['tenant_id']) {
                json_response(['success' => false, 'message' => 'User is not assigned to a customer account'], 403);
            }
            if ($dbUser['tenant_status'] !== 'active') {
                json_response(['success' => false, 'message' => 'Customer account is not active'], 403);
            }
        }

        $impersonationContext = null;
        if (!empty($payload['impersonation_id'])) {
            $impersonationStmt = $pdo->prepare("
                SELECT ai.id,ai.admin_user_id,ai.target_user_id,ai.tenant_id,ai.status,ai.expires_at,
                       admin.name AS admin_name
                FROM admin_impersonations ai
                INNER JOIN users admin ON admin.id=ai.admin_user_id AND admin.role='super_admin' AND admin.is_active=1
                WHERE ai.id=:id AND ai.target_user_id=:target_user_id
                  AND ai.status='active' AND ai.expires_at > NOW()
                LIMIT 1
            ");
            $impersonationStmt->execute([
                ':id' => (int) $payload['impersonation_id'],
                ':target_user_id' => $userId,
            ]);
            $impersonationContext = $impersonationStmt->fetch();
            if (!$impersonationContext) {
                json_response(['success' => false, 'message' => 'نشست ورود موقت پایان یافته است.'], 401);
            }
        }

        $user = [
            'id' => (int) $dbUser['id'],
            'tenant_id' => $dbUser['tenant_id'] !== null ? (int) $dbUser['tenant_id'] : null,
            'tenant_name' => $dbUser['tenant_name'],
            'name' => $dbUser['name'],
            'email' => $dbUser['email'],
            'phone' => $dbUser['phone'],
            'role' => $dbUser['role'],
            'token_version' => (int) $dbUser['token_version'],
            'must_change_password' => (bool) $dbUser['must_change_password'],
            'two_factor_enabled' => (bool) $dbUser['two_factor_enabled'],
            'ip_allowlist_enabled' => (bool) $dbUser['ip_allowlist_enabled'],
            'session_jti' => (string) $payload['jti'],
        ];

        if ($impersonationContext) {
            $user += [
                'is_impersonating' => true,
                'impersonation_id' => (int) $impersonationContext['id'],
                'impersonator_user_id' => (int) $impersonationContext['admin_user_id'],
                'impersonator_name' => $impersonationContext['admin_name'],
                'impersonation_expires_at' => $impersonationContext['expires_at'],
            ];
        }

        if ($dbUser['role'] === 'super_admin') {
            $access = admin_load_access($pdo, (int) $dbUser['id']);
            if ($access['role_id'] === null) {
                json_response(['success' => false, 'message' => 'نقش مدیریتی این حساب معتبر یا فعال نیست.'], 403);
            }
            $user += [
                'admin_role_id' => $access['role_id'],
                'admin_role_code' => $access['role_code'],
                'admin_role_name' => $access['role_name'],
                'is_platform_owner' => $access['is_owner'],
                'permissions' => $access['permissions'],
            ];
            security_enforce_admin_ip_allowlist($pdo, $user);
            admin_enforce_current_script_permission($user);
        }

        return $user;
    }
}

if (!function_exists('require_role')) {
    function require_role(array $user, array $allowedRoles): void
    {
        if (!in_array($user['role'], $allowedRoles, true)) {
            json_response(['success' => false, 'message' => 'You do not have permission to access this resource'], 403);
        }
    }
}
