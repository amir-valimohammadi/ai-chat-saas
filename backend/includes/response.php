<?php

// مسیر فایل: ai-chat-saas/backend/includes/response.php
// هدف: خروجی JSON استاندارد، معتبر و امن برای APIها

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/security-headers.php';

if (!function_exists('sanitize_json_error_response')) {
    function sanitize_json_error_response(array $data, int $statusCode): array
    {
        if ($statusCode < 400) {
            return $data;
        }

        $sensitiveKeys = [
            'error', 'debug', 'trace', 'exception', 'file', 'line', 'sql', 'query', 'pdo_error',
        ];

        $sanitize = static function (mixed $value) use (&$sanitize, $sensitiveKeys): mixed {
            if (!is_array($value)) {
                return $value;
            }

            $clean = [];
            foreach ($value as $key => $item) {
                if (is_string($key) && in_array(strtolower($key), $sensitiveKeys, true)) {
                    continue;
                }
                $clean[$key] = $sanitize($item);
            }
            return $clean;
        };

        $data = $sanitize($data);

        if (isset($data['message']) && is_string($data['message'])) {
            $technicalPattern = '/SQLSTATE|PDOException|Invalid parameter number|Integrity constraint|Stack trace|Fatal error|Uncaught|\\xampp\\|\/[A-Za-z0-9_.-]+\.php(?:[:\s]|$)/i';
            if (preg_match($technicalPattern, $data['message'])) {
                $data['message'] = $statusCode >= 500
                    ? 'Internal server error'
                    : 'The request could not be processed.';
            }
        }

        if ($statusCode >= 500 && empty($data['message'])) {
            $data['message'] = 'Internal server error';
        }

        return $data;
    }
}

if (!class_exists('ApiPublicException')) {
    /** An exception whose message is deliberately safe to show to an API client. */
    class ApiPublicException extends RuntimeException
    {
    }
}

if (!function_exists('safe_api_exception_context')) {
    /**
     * Log a caught API exception without exposing its technical details to clients.
     * The empty array is designed for use with array unpacking in json_response payloads.
     */
    function safe_api_exception_context(Throwable $exception): array
    {
        if (function_exists('app_log_error')) {
            app_log_error($exception, [
                'status_code' => 500,
                'uri' => $_SERVER['REQUEST_URI'] ?? null,
                'method' => $_SERVER['REQUEST_METHOD'] ?? null,
            ]);
        } else {
            error_log('[AI_CHAT_SAAS_API_ERROR] ' . $exception->getMessage());
        }

        return [];
    }
}

if (!function_exists('safe_api_exception_message')) {
    /**
     * Preserve explicitly public validation messages while logging and replacing
     * every unexpected exception with a stable client-safe fallback.
     */
    function safe_api_exception_message(Throwable $exception, string $fallback = 'The request could not be processed.'): string
    {
        if ($exception instanceof ApiPublicException) {
            return $exception->getMessage();
        }

        safe_api_exception_context($exception);
        return $fallback;
    }
}

if (!function_exists('json_response')) {
    function json_response(array $data, int $statusCode = 200): void
    {
        if ($statusCode >= 400 && !array_key_exists('request_id', $data) && function_exists('app_request_id')) {
            $data['request_id'] = app_request_id();
        }

        $data = sanitize_json_error_response($data, $statusCode);

        // هر خروجی ناخواسته قبلی (Warning، whitespace یا debug echo) حذف می‌شود.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        if (!headers_sent()) {
            http_response_code($statusCode);
            send_common_security_headers('api');
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            if (function_exists('app_request_id')) {
                header('X-Request-ID: ' . app_request_id());
            }
            if ($statusCode >= 400) {
                header_remove('Content-Disposition');
                header_remove('Content-Length');
            }
        }

        global $pdo;
        if (
            $statusCode >= 500
            && isset($pdo)
            && $pdo instanceof PDO
            && function_exists('operations_store_response_error')
        ) {
            try {
                operations_store_response_error($pdo, $data, $statusCode);
            } catch (Throwable $loggingError) {
                error_log('[AI_CHAT_SAAS_RESPONSE_LOGGING_FAILURE] ' . $loggingError->getMessage());
            }
        }

        try {
            $json = json_encode(
                $data,
                JSON_UNESCAPED_UNICODE
                | JSON_UNESCAPED_SLASHES
                | JSON_INVALID_UTF8_SUBSTITUTE
                | JSON_THROW_ON_ERROR
            );
        } catch (Throwable $encodingError) {
            error_log('[AI_CHAT_SAAS_JSON_ENCODING_FAILURE] ' . $encodingError->getMessage());
            if (!headers_sent()) {
                http_response_code(500);
            }
            $json = json_encode([
                'success' => false,
                'message' => 'Internal server error',
                'request_id' => function_exists('app_request_id') ? app_request_id() : null,
            ], JSON_UNESCAPED_SLASHES);
        }

        echo $json;
        exit;
    }
}
