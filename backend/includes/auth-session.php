<?php

declare(strict_types=1);

require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/admin-access.php';

if (!function_exists('auth_client_ip')) {
    function auth_client_ip(): ?string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        return $ip !== '' ? substr($ip, 0, 45) : null;
    }
}

if (!function_exists('auth_user_agent')) {
    function auth_user_agent(): ?string
    {
        $ua = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        return $ua !== '' ? substr($ua, 0, 500) : null;
    }
}

if (!function_exists('auth_public_user')) {
    function auth_public_user(PDO $pdo, array $user): array
    {
        $public = [
            'id' => (int) $user['id'],
            'tenant_id' => $user['tenant_id'] !== null ? (int) $user['tenant_id'] : null,
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'] ?? null,
            'role' => $user['role'],
            'must_change_password' => !empty($user['must_change_password']),
            'two_factor_enabled' => !empty($user['two_factor_enabled']),
        ];

        if ($user['role'] === 'super_admin') {
            $access = admin_load_access($pdo, (int) $user['id']);
            $public += [
                'admin_role_id' => $access['role_id'],
                'admin_role_code' => $access['role_code'],
                'admin_role_name' => $access['role_name'],
                'is_platform_owner' => $access['is_owner'],
                'permissions' => $access['permissions'],
            ];
        }

        return $public;
    }
}

if (!function_exists('auth_issue_session')) {
    function auth_issue_session(PDO $pdo, array $user): array
    {
        $now = time();
        $ttl = (int) app_config('jwt_expiration_seconds', 604800);
        if ($ttl <= 0) {
            $ttl = 604800;
        }

        $jti = bin2hex(random_bytes(24));
        $payload = [
            'iss' => (string) app_config('jwt_issuer', 'ai-chat-saas'),
            'aud' => (string) app_config('jwt_audience', 'ai-chat-saas-panel'),
            'sub' => (int) $user['id'],
            'tenant_id' => $user['tenant_id'] !== null ? (int) $user['tenant_id'] : null,
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'token_version' => (int) $user['token_version'],
            'jti' => $jti,
            'iat' => $now,
            'nbf' => $now - 5,
            'exp' => $now + $ttl,
        ];

        $token = jwt_encode($payload);
        $stmt = $pdo->prepare("\n            INSERT INTO auth_sessions(\n                user_id,jti_hash,ip_address,user_agent,created_at,last_seen_at,expires_at\n            ) VALUES(\n                :user_id,:jti_hash,:ip_address,:user_agent,NOW(),NOW(),:expires_at\n            )\n        ");
        $stmt->execute([
            ':user_id' => (int) $user['id'],
            ':jti_hash' => hash('sha256', $jti),
            ':ip_address' => auth_client_ip(),
            ':user_agent' => auth_user_agent(),
            ':expires_at' => date('Y-m-d H:i:s', $now + $ttl),
        ]);

        return [
            'token' => $token,
            'expires_at' => date(DATE_ATOM, $now + $ttl),
            'session_id' => (int) $pdo->lastInsertId(),
            'user' => auth_public_user($pdo, $user),
        ];
    }
}

if (!function_exists('auth_validate_session')) {
    function auth_validate_session(PDO $pdo, int $userId, string $jti): bool
    {
        $hash = hash('sha256', $jti);
        $stmt = $pdo->prepare("\n            SELECT id\n            FROM auth_sessions\n            WHERE user_id=:user_id\n              AND jti_hash=:jti_hash\n              AND revoked_at IS NULL\n              AND expires_at > NOW()\n            LIMIT 1\n        ");
        $stmt->execute([':user_id' => $userId, ':jti_hash' => $hash]);
        $sessionId = $stmt->fetchColumn();
        if (!$sessionId) {
            return false;
        }

        $update = $pdo->prepare("\n            UPDATE auth_sessions\n            SET last_seen_at=NOW()\n            WHERE id=:id AND last_seen_at < DATE_SUB(NOW(), INTERVAL 60 SECOND)\n        ");
        $update->execute([':id' => (int) $sessionId]);
        return true;
    }
}

if (!function_exists('auth_revoke_sessions')) {
    function auth_revoke_sessions(PDO $pdo, int $userId, ?int $actorId, string $reason, ?int $sessionId = null): int
    {
        $sql = "UPDATE auth_sessions SET revoked_at=NOW(), revoked_by=:revoked_by, revocation_reason=:reason\n                WHERE user_id=:user_id AND revoked_at IS NULL";
        $params = [
            ':revoked_by' => $actorId,
            ':reason' => substr($reason, 0, 255),
            ':user_id' => $userId,
        ];
        if ($sessionId !== null) {
            $sql .= ' AND id=:session_id';
            $params[':session_id'] = $sessionId;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }
}
