<?php

// مسیر فایل: ai-chat-saas/backend/includes/error-handler.php
// هدف: مدیریت امن خطاها، جلوگیری از نمایش جزئیات حساس در production

require_once __DIR__ . '/../config/app.php';

if (app_is_production() || !app_debug_enabled()) {
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
} else {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
}

error_reporting(E_ALL);

if (!function_exists('app_log_error')) {
    function app_log_error(Throwable $exception, array $context = []): void
    {
        $logData = [
            'time' => date('Y-m-d H:i:s'),
            'message' => $exception->getMessage(),
            'file' => $exception->getFile(),
            'line' => $exception->getLine(),
            'context' => $context,
        ];

        error_log('[AI_CHAT_SAAS_ERROR] ' . json_encode($logData, JSON_UNESCAPED_UNICODE));

        global $pdo;
        if (isset($pdo) && $pdo instanceof PDO && function_exists('operations_store_error')) {
            operations_store_error(
                $pdo,
                $exception,
                $context,
                'php',
                ($context['status_code'] ?? 500) >= 500 ? 'critical' : 'error'
            );
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
        ], $extra);

        if (!app_is_production() && app_debug_enabled() && $exception) {
            $payload['debug'] = [
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
        array $extra = []
    ): void {
        if ($exception) {
            app_log_error($exception, [
                'status_code' => $statusCode,
                'public_message' => $publicMessage,
                'uri' => $_SERVER['REQUEST_URI'] ?? null,
                'method' => $_SERVER['REQUEST_METHOD'] ?? null,
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
        }

        if (function_exists('json_response')) {
            json_response(
                safe_error_payload($publicMessage, $exception, $extra),
                $statusCode
            );
        }

        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode(
            safe_error_payload($publicMessage, $exception, $extra),
            JSON_UNESCAPED_UNICODE
        );

        exit;
    }
}

set_exception_handler(function (Throwable $exception) {
    safe_json_error('Internal server error', 500, $exception);
});

register_shutdown_function(function () {
    $error = error_get_last();

    if (!$error) {
        return;
    }

    $fatalTypes = [
        E_ERROR,
        E_PARSE,
        E_CORE_ERROR,
        E_COMPILE_ERROR,
        E_USER_ERROR,
    ];

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

    if (headers_sent()) {
        app_log_error($exception, [
            'fatal_shutdown' => true,
            'headers_sent' => true,
        ]);

        return;
    }

    safe_json_error('Internal server error', 500, $exception);
});