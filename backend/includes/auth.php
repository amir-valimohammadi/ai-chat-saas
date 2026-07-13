<?php

// مسیر فایل: ai-chat-saas/backend/includes/auth.php
// هدف: بررسی توکن JWT و گرفتن کاربر لاگین‌شده

require_once __DIR__ . '/response.php';
require_once __DIR__ . '/jwt.php';

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

        if (!$header) {
            return null;
        }

        if (!preg_match('/^\s*Bearer\s+([A-Za-z0-9\-_\.]+)\s*$/i', $header, $matches)) {
            return null;
        }

        $token = $matches[1];

        if (strlen($token) > 4096) {
            return null;
        }

        return $token;
    }
}

if (!function_exists('require_auth')) {
    function require_auth(PDO $pdo): array
    {
        $token = get_bearer_token();

        if (!$token) {
            json_response([
                'success' => false,
                'message' => 'Authorization token is required'
            ], 401);
        }

        try {
            $payload = jwt_decode($token);
        } catch (Throwable $e) {
            error_log('[AI_CHAT_SAAS_SECURITY] JWT decode failed: ' . $e->getMessage());

            json_response([
                'success' => false,
                'message' => 'Authentication is temporarily unavailable'
            ], 500);
        }

        if (
            !$payload ||
            !isset(
                $payload['sub'],
                $payload['exp'],
                $payload['iat'],
                $payload['jti'],
                $payload['token_version']
            )
        ) {
            json_response([
                'success' => false,
                'message' => 'Invalid or expired token'
            ], 401);
        }

        $userId = (int) $payload['sub'];

        if ($userId <= 0) {
            json_response([
                'success' => false,
                'message' => 'Invalid or expired token'
            ], 401);
        }

        $stmt = $pdo->prepare("
            SELECT 
                users.id,
                users.tenant_id,
                users.name,
                users.email,
                users.phone,
                users.role,
                users.is_active,
                users.token_version,
                tenants.name AS tenant_name,
                tenants.status AS tenant_status
            FROM users
            LEFT JOIN tenants ON tenants.id = users.tenant_id
            WHERE users.id = :id
            LIMIT 1
        ");

        $stmt->execute([
            ':id' => $userId
        ]);

        $user = $stmt->fetch();

        if (!$user) {
            json_response([
                'success' => false,
                'message' => 'User not found'
            ], 401);
        }

        if ((int) $user['is_active'] !== 1) {
            json_response([
                'success' => false,
                'message' => 'User account is inactive'
            ], 403);
        }

        $payloadTokenVersion = (int) $payload['token_version'];

        if ($payloadTokenVersion !== (int) $user['token_version']) {
            json_response([
                'success' => false,
                'message' => 'Token has been revoked'
            ], 401);
        }

        if (isset($payload['email']) && $payload['email'] !== $user['email']) {
            json_response([
                'success' => false,
                'message' => 'Token has been revoked'
            ], 401);
        }

        if (isset($payload['role']) && $payload['role'] !== $user['role']) {
            json_response([
                'success' => false,
                'message' => 'Token has been revoked'
            ], 401);
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

        return [
            'id' => (int) $user['id'],
            'tenant_id' => $user['tenant_id'] !== null ? (int) $user['tenant_id'] : null,
            'tenant_name' => $user['tenant_name'],
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'role' => $user['role'],
            'token_version' => (int) $user['token_version'],
        ];
    }
}

if (!function_exists('require_role')) {
    function require_role(array $user, array $allowedRoles): void
    {
        if (!in_array($user['role'], $allowedRoles, true)) {
            json_response([
                'success' => false,
                'message' => 'You do not have permission to access this resource'
            ], 403);
        }
    }
}