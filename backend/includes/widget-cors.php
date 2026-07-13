<?php

// مسیر فایل: ai-chat-saas/backend/includes/widget-cors.php
// هدف: CORS کنترل‌شده برای APIهای عمومی ویجت

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/security-headers.php';

send_common_security_headers('api');

if (!function_exists('is_valid_cors_origin')) {
    function is_valid_cors_origin(string $origin): bool
    {
        if ($origin === '' || $origin === 'null') {
            return false;
        }

        if (str_contains($origin, "\r") || str_contains($origin, "\n")) {
            return false;
        }

        $scheme = parse_url($origin, PHP_URL_SCHEME);
        $host = parse_url($origin, PHP_URL_HOST);

        return in_array($scheme, ['http', 'https'], true) && !empty($host);
    }
}

if (!function_exists('normalize_origin_host')) {
    function normalize_origin_host(string $origin): string
    {
        if (!is_valid_cors_origin($origin)) {
            return '';
        }

        $host = parse_url($origin, PHP_URL_HOST);

        return $host ? strtolower($host) : '';
    }
}

if (!function_exists('normalize_site_domain')) {
    function normalize_site_domain(?string $domain): string
    {
        $domain = trim((string) $domain);

        if ($domain === '') {
            return '';
        }

        if (!str_starts_with($domain, 'http://') && !str_starts_with($domain, 'https://')) {
            $domain = 'https://' . $domain;
        }

        $host = parse_url($domain, PHP_URL_HOST);

        return $host ? strtolower($host) : '';
    }
}

if (!function_exists('hosts_match_for_widget')) {
    function hosts_match_for_widget(string $originHost, string $siteHost): bool
    {
        if ($originHost === '' || $siteHost === '') {
            return false;
        }

        if ($originHost === $siteHost) {
            return true;
        }

        // اجازه برای حالت رایج example.com و www.example.com
        if ($originHost === 'www.' . $siteHost) {
            return true;
        }

        if ($siteHost === 'www.' . $originHost) {
            return true;
        }

        return false;
    }
}

if (!function_exists('is_local_widget_origin')) {
    function is_local_widget_origin(string $origin): bool
    {
        $host = normalize_origin_host($origin);

        return in_array($host, ['localhost', '127.0.0.1'], true);
    }
}

if (!function_exists('get_extra_widget_allowed_hosts')) {
    function get_extra_widget_allowed_hosts(): array
    {
        $raw = trim((string) app_env('WIDGET_ALLOWED_ORIGINS', ''));

        if ($raw === '') {
            return [];
        }

        $items = array_filter(array_map('trim', explode(',', $raw)));

        return array_values(array_filter(array_map(function ($item) {
            return normalize_site_domain($item);
        }, $items)));
    }
}

if (!function_exists('is_extra_widget_origin_allowed')) {
    function is_extra_widget_origin_allowed(string $origin): bool
    {
        $originHost = normalize_origin_host($origin);

        if ($originHost === '') {
            return false;
        }

        foreach (get_extra_widget_allowed_hosts() as $allowedHost) {
            if (hosts_match_for_widget($originHost, $allowedHost)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('send_widget_cors_headers')) {
    function send_widget_cors_headers(?string $allowedOrigin = null): void
    {
        if ($allowedOrigin && is_valid_cors_origin($allowedOrigin)) {
            header("Access-Control-Allow-Origin: {$allowedOrigin}");
            header('Vary: Origin');
        }

        // ویجت عمومی از Cookie استفاده نمی‌کند؛ پس Credentials را فعال نمی‌کنیم.
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Max-Age: 86400');
        header('X-Content-Type-Options: nosniff');
    }
}

if (!function_exists('fail_widget_origin')) {
    function fail_widget_origin(): void
    {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store, no-cache, must-revalidate');

        echo json_encode([
            'success' => false,
            'message' => 'Widget origin is not allowed'
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }
}

if (!function_exists('validate_widget_origin_or_fail')) {
    function validate_widget_origin_or_fail(?string $siteDomain): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origin === '') {
            // در local برای Postman یا تست مستقیم آزاد است.
            if (!app_is_production()) {
                send_widget_cors_headers(null);
                return;
            }

            // در production فقط اگر خودت عمداً فعال کرده باشی.
            if ((string) app_env('WIDGET_ALLOW_EMPTY_ORIGIN', 'false') === 'true') {
                send_widget_cors_headers(null);
                return;
            }

            fail_widget_origin();
        }

        if (!is_valid_cors_origin($origin)) {
            fail_widget_origin();
        }

        if (!app_is_production() && is_local_widget_origin($origin)) {
            send_widget_cors_headers($origin);
            return;
        }

        if (is_extra_widget_origin_allowed($origin)) {
            send_widget_cors_headers($origin);
            return;
        }

        $originHost = normalize_origin_host($origin);
        $siteHost = normalize_site_domain($siteDomain);

        if (hosts_match_for_widget($originHost, $siteHost)) {
            send_widget_cors_headers($origin);
            return;
        }

        fail_widget_origin();
    }
}

// Preflight بدنه درخواست را ندارد؛ پس site_key قابل بررسی کامل نیست.
// اینجا فقط Origin معتبر را echo می‌کنیم و کنترل اصلی در درخواست واقعی انجام می‌شود.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($origin !== '' && is_valid_cors_origin($origin)) {
        send_widget_cors_headers($origin);
    } else {
        send_widget_cors_headers(null);
    }

    http_response_code(204);
    exit;
}

send_widget_cors_headers(null);