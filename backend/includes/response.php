<?php

// مسیر فایل: ai-chat-saas/backend/includes/response.php
// هدف: خروجی JSON استاندارد و امن برای APIها

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/security-headers.php';

if (!function_exists('sanitize_json_response_for_production')) {
    function sanitize_json_response_for_production(array $data, int $statusCode): array
    {
        if (!function_exists('app_is_production')) {
            return $data;
        }

        if (!app_is_production()) {
            return $data;
        }

        if ($statusCode < 500) {
            return $data;
        }

        $sensitiveKeys = [
            'error',
            'debug',
            'trace',
            'exception',
            'file',
            'line',
            'sql',
            'query',
            'pdo_error',
        ];

        foreach ($sensitiveKeys as $key) {
            if (array_key_exists($key, $data)) {
                unset($data[$key]);
            }
        }

        if (empty($data['message'])) {
            $data['message'] = 'Internal server error';
        }

        return $data;
    }
}

if (!function_exists('json_response')) {
    function json_response(array $data, int $statusCode = 200): void
    {
        $data = sanitize_json_response_for_production($data, $statusCode);

        if (!headers_sent()) {
            http_response_code($statusCode);
            send_common_security_headers('api');
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
        }

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}