<?php

declare(strict_types=1);

require_once __DIR__ . '/auth-session.php';

if (!function_exists('security_log_login_attempt')) {
    function security_log_login_attempt(PDO $pdo, ?int $userId, string $email, bool $success, ?string $reason): void
    {
        $stmt = $pdo->prepare("\n            INSERT INTO admin_login_attempts(\n                user_id,email,success,failure_reason,ip_address,user_agent,created_at\n            ) VALUES(:user_id,:email,:success,:reason,:ip,:ua,NOW())\n        ");
        $stmt->execute([
            ':user_id' => $userId,
            ':email' => substr(strtolower($email), 0, 190),
            ':success' => $success ? 1 : 0,
            ':reason' => $reason,
            ':ip' => auth_client_ip(),
            ':ua' => auth_user_agent(),
        ]);
    }
}

if (!function_exists('security_log_event')) {
    function security_log_event(PDO $pdo, ?int $userId, string $type, string $severity, string $title, ?array $details = null): int
    {
        $allowed = ['info','warning','critical'];
        if (!in_array($severity, $allowed, true)) {
            $severity = 'info';
        }
        $json = $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
        $stmt = $pdo->prepare("\n            INSERT INTO admin_security_events(\n                user_id,event_type,severity,title,details_json,ip_address,user_agent,created_at\n            ) VALUES(:user_id,:event_type,:severity,:title,:details,:ip,:ua,NOW())\n        ");
        $stmt->execute([
            ':user_id' => $userId,
            ':event_type' => substr($type, 0, 100),
            ':severity' => $severity,
            ':title' => substr($title, 0, 255),
            ':details' => $json,
            ':ip' => auth_client_ip(),
            ':ua' => auth_user_agent(),
        ]);
        return (int) $pdo->lastInsertId();
    }
}

if (!function_exists('security_ip_matches_cidr')) {
    function security_ip_matches_cidr(string $ip, string $cidr): bool
    {
        $cidr = trim($cidr);
        if (!str_contains($cidr, '/')) {
            return hash_equals($cidr, $ip);
        }

        [$network, $prefix] = explode('/', $cidr, 2);
        if (!filter_var($ip, FILTER_VALIDATE_IP) || !filter_var($network, FILTER_VALIDATE_IP) || !ctype_digit($prefix)) {
            return false;
        }

        $ipBinary = inet_pton($ip);
        $networkBinary = inet_pton($network);
        if ($ipBinary === false || $networkBinary === false || strlen($ipBinary) !== strlen($networkBinary)) {
            return false;
        }

        $maxBits = strlen($ipBinary) * 8;
        $bits = (int) $prefix;
        if ($bits < 0 || $bits > $maxBits) {
            return false;
        }

        $fullBytes = intdiv($bits, 8);
        $remaining = $bits % 8;
        if ($fullBytes > 0 && substr($ipBinary, 0, $fullBytes) !== substr($networkBinary, 0, $fullBytes)) {
            return false;
        }
        if ($remaining === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $remaining)) & 0xFF;
        return (ord($ipBinary[$fullBytes]) & $mask) === (ord($networkBinary[$fullBytes]) & $mask);
    }
}

if (!function_exists('security_normalize_cidr')) {
    function security_normalize_cidr(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (!str_contains($value, '/')) {
            return filter_var($value, FILTER_VALIDATE_IP) ? $value : null;
        }
        [$ip, $prefix] = explode('/', $value, 2);
        if (!filter_var($ip, FILTER_VALIDATE_IP) || !ctype_digit($prefix)) {
            return null;
        }
        $max = str_contains($ip, ':') ? 128 : 32;
        $bits = (int) $prefix;
        if ($bits < 0 || $bits > $max) {
            return null;
        }
        return $ip . '/' . $bits;
    }
}

if (!function_exists('security_admin_ip_allowed')) {
    function security_admin_ip_allowed(PDO $pdo, int $userId, string $ip): bool
    {
        $stmt = $pdo->prepare('SELECT ip_cidr FROM admin_ip_allowlist WHERE user_id=:user_id AND is_active=1');
        $stmt->execute([':user_id' => $userId]);
        foreach ($stmt->fetchAll() as $row) {
            if (security_ip_matches_cidr($ip, (string) $row['ip_cidr'])) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('security_enforce_admin_ip_allowlist')) {
    function security_enforce_admin_ip_allowlist(PDO $pdo, array $user): void
    {
        if (($user['role'] ?? null) !== 'super_admin' || empty($user['ip_allowlist_enabled'])) {
            return;
        }
        $ip = auth_client_ip();
        if ($ip === null) {
            security_log_event($pdo, (int) $user['id'], 'ip_allowlist_denied', 'critical', 'ورود مدیر به دلیل نامشخص بودن IP رد شد');
            json_response(['success' => false, 'message' => 'دسترسی این IP به پنل مدیریت مجاز نیست.'], 403);
        }
        if (!security_admin_ip_allowed($pdo, (int) $user['id'], $ip)) {
            security_log_event($pdo, (int) $user['id'], 'ip_allowlist_denied', 'critical', 'تلاش ورود مدیر از IP غیرمجاز', ['ip' => $ip]);
            json_response(['success' => false, 'message' => 'دسترسی این IP به پنل مدیریت مجاز نیست.'], 403);
        }
    }
}
