<?php

// مسیر فایل: ai-chat-saas/backend/includes/rate-limit.php
// هدف: محدودسازی تعداد درخواست‌ها برای جلوگیری از brute force و spam

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/response.php';

if (!function_exists('get_client_ip')) {
    function get_client_ip(): string
    {
        $candidates = [
            $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
            $_SERVER['HTTP_X_REAL_IP'] ?? '',
            $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
            $_SERVER['REMOTE_ADDR'] ?? '',
        ];

        foreach ($candidates as $candidate) {
            $candidate = trim((string) $candidate);

            if ($candidate === '') {
                continue;
            }

            if (str_contains($candidate, ',')) {
                $candidate = trim(explode(',', $candidate)[0]);
            }

            if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }

        return 'unknown';
    }
}

if (!function_exists('rate_limit_identifier')) {
    function rate_limit_identifier(?string $extra = null): string
    {
        $ip = get_client_ip();
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

        return trim($ip . '|' . $userAgent . '|' . ($extra ?? ''));
    }
}

if (!function_exists('rate_limit_key')) {
    function rate_limit_key(string $action, string $identifier): string
    {
        return hash('sha256', $action . '|' . $identifier);
    }
}

if (!function_exists('enforce_rate_limit')) {
    function enforce_rate_limit(
        PDO $pdo,
        string $action,
        string $identifier,
        int $maxAttempts,
        int $windowSeconds,
        string $message = 'Too many requests. Please try again later.'
    ): void {
        if ($maxAttempts <= 0 || $windowSeconds <= 0) {
            return;
        }

        $now = time();
        $windowStart = date('Y-m-d H:i:s', $now);
        $expiresAt = date('Y-m-d H:i:s', $now + $windowSeconds);
        $identifierHash = hash('sha256', $identifier);
        $rateKey = rate_limit_key($action, $identifier);

        // Atomic upsert prevents concurrent first requests from racing on the unique rate_key.
        $upsertStmt = $pdo->prepare("
            INSERT INTO api_rate_limits (
                rate_key, action, identifier_hash, hits, window_start, expires_at
            ) VALUES (
                :rate_key, :action, :identifier_hash, 1, :window_start, :expires_at
            )
            ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                identifier_hash = VALUES(identifier_hash),
                hits = IF(expires_at <= NOW(), 1, hits + 1),
                window_start = IF(expires_at <= NOW(), VALUES(window_start), window_start),
                expires_at = IF(expires_at <= NOW(), VALUES(expires_at), expires_at)
        ");
        $upsertStmt->execute([
            ':rate_key' => $rateKey,
            ':action' => $action,
            ':identifier_hash' => $identifierHash,
            ':window_start' => $windowStart,
            ':expires_at' => $expiresAt,
        ]);

        $stateStmt = $pdo->prepare("
            SELECT hits, expires_at
            FROM api_rate_limits
            WHERE rate_key = :rate_key
            LIMIT 1
        ");
        $stateStmt->execute([':rate_key' => $rateKey]);
        $state = $stateStmt->fetch();

        if (!$state) {
            return;
        }

        $hits = (int) $state['hits'];
        $recordExpiresAt = strtotime((string) $state['expires_at']) ?: ($now + $windowSeconds);

        if ($hits > $maxAttempts) {
            $retryAfter = max($recordExpiresAt - $now, 1);
            if (!headers_sent()) {
                header('Retry-After: ' . $retryAfter);
            }
            json_response([
                'success' => false,
                'message' => $message,
                'retry_after_seconds' => $retryAfter,
            ], 429);
        }

        if (random_int(1, 100) <= 5) {
            $cleanupStmt = $pdo->prepare("
                DELETE FROM api_rate_limits
                WHERE expires_at < NOW()
                LIMIT 200
            ");
            $cleanupStmt->execute();
        }
    }
}

if (!function_exists('clear_rate_limit')) {
    function clear_rate_limit(PDO $pdo, string $action, string $identifier): void
    {
        $rateKey = rate_limit_key($action, $identifier);

        $stmt = $pdo->prepare("
            DELETE FROM api_rate_limits
            WHERE rate_key = :rate_key
        ");

        $stmt->execute([
            ':rate_key' => $rateKey,
        ]);
    }
}