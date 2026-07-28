<?php

// مسیر فایل: ai-chat-saas/backend/includes/error-handler.php
// هدف: مدیریت امن خطاها و تضمین اینکه API هیچ Warning/HTML خامی قبل از JSON چاپ نکند

require_once __DIR__ . '/../config/app.php';

$isInteractiveCli = PHP_SAPI === 'cli';
ini_set('display_errors', $isInteractiveCli && app_debug_enabled() ? '1' : '0');
ini_set('display_startup_errors', $isInteractiveCli && app_debug_enabled() ? '1' : '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// در درخواست HTTP خروجی را تا زمان تولید پاسخ نهایی نگه می‌داریم؛ json_response آن را پاک می‌کند.
if (!$isInteractiveCli && ob_get_level() === 0) {
    ob_start();
}

if (!defined('APP_RUNTIME_ERROR_HANDLER_INSTALLED')) {
    define('APP_RUNTIME_ERROR_HANDLER_INSTALLED', true);

    set_error_handler(static function (
        int $severity,
        string $message,
        string $file,
        int $line
    ): bool {
        // خطاهای suppress شده با @ را به Exception تبدیل نکن.
        if (!(error_reporting() & $severity)) {
            return false;
        }

        $convertible = E_WARNING
            | E_NOTICE
            | E_USER_WARNING
            | E_USER_NOTICE
            | E_RECOVERABLE_ERROR;

        if (($severity & $convertible) === 0) {
            return false;
        }

        throw new ErrorException($message, 0, $severity, $file, $line);
    });
}

if (!function_exists('app_log_error')) {
    function app_log_error(Throwable $exception, array $context = []): void
    {
        $logData = [
            'time' => date('Y-m-d H:i:s'),
            'request_id' => function_exists('app_request_id') ? app_request_id() : null,
            'message' => $exception->getMessage(),
            'exception' => get_class($exception),
            'file' => $exception->getFile(),
            'line' => $exception->getLine(),
            'context' => $context,
        ];

        error_log('[AI_CHAT_SAAS_ERROR] ' . json_encode(
            $logData,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        ));

        global $pdo;
        if (isset($pdo) && $pdo instanceof PDO && function_exists('operations_store_error')) {
            try {
                operations_store_error(
                    $pdo,
                    $exception,
                    $context,
                    'php',
                    ($context['status_code'] ?? 500) >= 500 ? 'critical' : 'error'
                );
            } catch (Throwable $loggingError) {
                error_log('[AI_CHAT_SAAS_ERROR_LOGGING_FAILURE] ' . $loggingError->getMessage());
            }
        }
    }
}

if (!function_exists('safe_error_payload')) {
    function safe_error_payload(
        string $publicMessage,
        ?Throwable $exception = null,
        array $extra = []
    ): array {
        $payload = array_merge([
            'success' => false,
            'message' => $publicMessage,
            'request_id' => function_exists('app_request_id') ? app_request_id() : null,
        ], $extra);

        if (!app_is_production() && app_debug_enabled() && $exception) {
            $payload['debug'] = [
                'type' => get_class($exception),
                'error' => $exception->getMessage(),
                'file' => $exception->getFile(),
                'line' => $exception->getLine(),
            ];
        }

        return $payload;
    }
}

if (!function_exists('safe_json_error')) {
    function safe_json_error(
        string $publicMessage = 'Internal server error',
        int $statusCode = 500,
        ?Throwable $exception = null,
        array $extra = [],
        array $logContext = []
    ): void {
        if ($exception) {
            app_log_error($exception, array_merge([
                'status_code' => $statusCode,
                'public_message' => $publicMessage,
                'uri' => $_SERVER['REQUEST_URI'] ?? null,
                'method' => $_SERVER['REQUEST_METHOD'] ?? null,
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            ], $logContext));
        }

        if (function_exists('json_response')) {
            json_response(safe_error_payload($publicMessage, $exception, $extra), $statusCode);
        }

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        if (function_exists('app_request_id')) {
            header('X-Request-ID: ' . app_request_id());
        }

        echo json_encode(
            safe_error_payload($publicMessage, $exception, $extra),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        );
        exit;
    }
}

set_exception_handler(static function (Throwable $exception): void {
    safe_json_error('Internal server error', 500, $exception);
});

register_shutdown_function(static function (): void {
    $error = error_get_last();
    if (!$error) {
        return;
    }

    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array($error['type'], $fatalTypes, true)) {
        return;
    }

    $exception = new ErrorException(
        $error['message'],
        0,
        $error['type'],
        $error['file'],
        $error['line']
    );

    safe_json_error('Internal server error', 500, $exception, ['fatal_shutdown' => true]);
});
