<?php

// مسیر فایل: ai-chat-saas/backend/includes/security-headers.php
// هدف: ارسال هدرهای امنیتی عمومی برای APIهای بک‌اند

require_once __DIR__ . '/../config/app.php';

if (!function_exists('app_request_is_https')) {
    function app_request_is_https(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }

        if (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
            return true;
        }

        return false;
    }
}

if (!function_exists('send_common_security_headers')) {
    function send_common_security_headers(string $context = 'api'): void
    {
        if (headers_sent()) {
            return;
        }

        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header('X-Permitted-Cross-Domain-Policies: none');

        header(
            'Permissions-Policy: accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
        );

        if ($context === 'api') {
            header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        }

        if (app_is_production() && app_request_is_https()) {
            header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
        }
    }
}