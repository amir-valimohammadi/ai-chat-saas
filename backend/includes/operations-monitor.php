<?php

// مسیر فایل: backend/includes/operations-monitor.php
// هدف: ثبت خطاهای تجمیع‌شده و درخواست‌های کند/ناموفق برای مرکز عملیات

require_once __DIR__ . '/../config/app.php';

if (!defined('APP_REQUEST_STARTED_AT')) {
    define(
        'APP_REQUEST_STARTED_AT',
        isset($_SERVER['REQUEST_TIME_FLOAT']) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : microtime(true)
    );
}

if (!function_exists('operations_safe_json')) {
    function operations_safe_json(array $context): ?string
    {
        if ($context === []) {
            return null;
        }

        $sensitive = ['password', 'token', 'secret', 'api_key', 'authorization', 'cookie'];
        $walker = static function (mixed $value) use (&$walker, $sensitive): mixed {
            if (!is_array($value)) {
                return $value;
            }

            $clean = [];
            foreach ($value as $key => $item) {
                if (in_array(strtolower((string) $key), $sensitive, true)) {
                    $clean[$key] = '[REDACTED]';
                    continue;
                }
                $clean[$key] = $walker($item);
            }
            return $clean;
        };

        $json = json_encode($walker($context), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $json === false ? null : $json;
    }
}

if (!function_exists('operations_store_error')) {
    function operations_store_error(
        PDO $pdo,
        Throwable $exception,
        array $context = [],
        string $source = 'php',
        string $level = 'error'
    ): void {
        try {
            $method = substr((string) ($_SERVER['REQUEST_METHOD'] ?? 'CLI'), 0, 10);
            $uri = substr((string) ($_SERVER['REQUEST_URI'] ?? ($_SERVER['SCRIPT_NAME'] ?? 'cli')), 0, 1000);
            $statusCandidate = $context['status_code'] ?? http_response_code();
            $statusCode = is_numeric($statusCandidate) ? (int) $statusCandidate : 500;
            if ($statusCode < 400) {
                $statusCode = 500;
            }
            $message = $exception->getMessage() !== '' ? $exception->getMessage() : get_class($exception);
            $fingerprint = hash('sha256', implode('|', [
                get_class($exception),
                $message,
                $exception->getFile(),
                (string) $exception->getLine(),
                $uri,
            ]));

            $stmt = $pdo->prepare("
                INSERT INTO system_error_logs (
                    fingerprint, level, source, message, exception_class,
                    file_path, line_number, request_method, request_uri,
                    status_code, context_json, occurrences, first_seen_at, last_seen_at
                ) VALUES (
                    :fingerprint, :level, :source, :message, :exception_class,
                    :file_path, :line_number, :request_method, :request_uri,
                    :status_code, :context_json, 1, NOW(), NOW()
                )
                ON DUPLICATE KEY UPDATE
                    level = VALUES(level),
                    status_code = VALUES(status_code),
                    context_json = VALUES(context_json),
                    occurrences = occurrences + 1,
                    last_seen_at = NOW(),
                    resolved_at = NULL,
                    resolved_by = NULL
            ");
            $stmt->execute([
                ':fingerprint' => $fingerprint,
                ':level' => in_array($level, ['warning', 'error', 'critical'], true) ? $level : 'error',
                ':source' => substr($source, 0, 100),
                ':message' => $message,
                ':exception_class' => substr(get_class($exception), 0, 190),
                ':file_path' => substr($exception->getFile(), 0, 500),
                ':line_number' => max(0, $exception->getLine()),
                ':request_method' => $method,
                ':request_uri' => $uri,
                ':status_code' => max(0, min(599, $statusCode)),
                ':context_json' => operations_safe_json($context),
            ]);
            $GLOBALS['APP_OPERATION_ERROR_RECORDED'] = true;
        } catch (Throwable $loggingError) {
            error_log('[AI_CHAT_SAAS_MONITOR] Unable to persist error: ' . $loggingError->getMessage());
        }
    }
}

if (!function_exists('operations_store_response_error')) {
    function operations_store_response_error(PDO $pdo, array $payload, int $statusCode): void
    {
        if ($statusCode < 500 || !empty($GLOBALS['APP_OPERATION_ERROR_RECORDED'])) {
            return;
        }

        $message = trim((string) ($payload['message'] ?? 'Internal server error'));
        $uri = substr((string) ($_SERVER['REQUEST_URI'] ?? '/'), 0, 1000);
        $method = substr((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'), 0, 10);
        $fingerprint = hash('sha256', implode('|', ['http_response', $statusCode, $method, $uri, $message]));

        try {
            $stmt = $pdo->prepare("
                INSERT INTO system_error_logs (
                    fingerprint, level, source, message, exception_class,
                    request_method, request_uri, status_code, context_json,
                    occurrences, first_seen_at, last_seen_at
                ) VALUES (
                    :fingerprint, 'critical', 'api_response', :message, 'HttpResponseError',
                    :request_method, :request_uri, :status_code, :context_json,
                    1, NOW(), NOW()
                )
                ON DUPLICATE KEY UPDATE
                    status_code = VALUES(status_code), context_json = VALUES(context_json),
                    occurrences = occurrences + 1, last_seen_at = NOW(),
                    resolved_at = NULL, resolved_by = NULL
            " );
            $stmt->execute([
                ':fingerprint' => $fingerprint,
                ':message' => $message !== '' ? $message : 'Internal server error',
                ':request_method' => $method,
                ':request_uri' => $uri,
                ':status_code' => $statusCode,
                ':context_json' => operations_safe_json(['response' => $payload]),
            ]);
            $GLOBALS['APP_OPERATION_ERROR_RECORDED'] = true;
        } catch (Throwable $loggingError) {
            error_log('[AI_CHAT_SAAS_MONITOR] Unable to persist response error: ' . $loggingError->getMessage());
        }
    }
}

if (!function_exists('operations_register_request_monitor')) {
    function operations_register_request_monitor(PDO $pdo): void
    {
        static $registered = false;

        if ($registered || PHP_SAPI === 'cli') {
            return;
        }

        $registered = true;

        register_shutdown_function(static function () use ($pdo): void {
            try {
                $durationMs = max(0, (microtime(true) - APP_REQUEST_STARTED_AT) * 1000);
                $statusCode = (int) (http_response_code() ?: 200);
                $thresholdMs = max(50, (int) app_env('REQUEST_LOG_SLOW_MS', 750));

                if ($durationMs < $thresholdMs && $statusCode < 500) {
                    return;
                }

                $method = substr((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'), 0, 10);
                $uri = substr((string) ($_SERVER['REQUEST_URI'] ?? '/'), 0, 1000);
                $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
                $ipHash = $ip !== ''
                    ? hash_hmac('sha256', $ip, (string) app_config('jwt_secret', 'monitor'))
                    : null;
                $userAgent = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));

                $stmt = $pdo->prepare("
                    INSERT INTO system_request_logs (
                        request_method, request_uri, status_code, duration_ms,
                        peak_memory_bytes, ip_hash, user_agent, occurred_at
                    ) VALUES (
                        :request_method, :request_uri, :status_code, :duration_ms,
                        :peak_memory_bytes, :ip_hash, :user_agent, NOW()
                    )
                ");
                $stmt->execute([
                    ':request_method' => $method,
                    ':request_uri' => $uri,
                    ':status_code' => max(0, min(599, $statusCode)),
                    ':duration_ms' => round($durationMs, 2),
                    ':peak_memory_bytes' => max(0, memory_get_peak_usage(true)),
                    ':ip_hash' => $ipHash,
                    ':user_agent' => $userAgent !== '' ? substr($userAgent, 0, 500) : null,
                ]);
            } catch (Throwable $loggingError) {
                // مانیتورینگ نباید پاسخ اصلی API را مختل کند.
                error_log('[AI_CHAT_SAAS_MONITOR] Unable to persist request metric: ' . $loggingError->getMessage());
            }
        });
    }
}
