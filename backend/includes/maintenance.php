<?php

// مسیر فایل: backend/includes/maintenance.php
// هدف: اعمال Maintenance Mode برای APIهای مشتری و ویجت، با دسترسی دائم Super Admin

require_once __DIR__ . '/system-settings.php';

if (!function_exists('maintenance_request_is_exempt')) {
    function maintenance_request_is_exempt(): bool
    {
        if (PHP_SAPI === 'cli' || ($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            return true;
        }

        $uri = strtolower((string) ($_SERVER['REQUEST_URI'] ?? ''));
        $exemptFragments = [
            '/api/super-admin/',
            '/api/auth/',
            '/api/system/',
            '/api/test-db.php',
            '/backend/public/',
        ];

        foreach ($exemptFragments as $fragment) {
            if (str_contains($uri, $fragment)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('maintenance_mode_state')) {
    /**
     * @return array{enabled: bool, message: string, until: ?string}
     */
    function maintenance_mode_state(PDO $pdo): array
    {
        $enabled = (bool) system_setting_get($pdo, 'maintenance_enabled', false);
        $until = system_setting_get($pdo, 'maintenance_until');
        $until = is_string($until) && trim($until) !== '' ? trim($until) : null;

        if ($enabled && $until !== null) {
            $untilTimestamp = strtotime($until);
            if ($untilTimestamp !== false && $untilTimestamp <= time()) {
                try {
                    system_setting_set($pdo, 'maintenance_enabled', false, 'boolean');
                    $enabled = false;
                } catch (Throwable) {
                    // اگر غیرفعال‌سازی خودکار ثبت نشد، پاسخ نگهداری امن‌تر است.
                }
            }
        }

        $message = trim((string) system_setting_get(
            $pdo,
            'maintenance_message',
            'سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.'
        ));

        if ($message === '') {
            $message = 'سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.';
        }

        return [
            'enabled' => $enabled,
            'message' => $message,
            'until' => $until,
        ];
    }
}

if (!function_exists('enforce_maintenance_mode')) {
    function enforce_maintenance_mode(PDO $pdo): void
    {
        if (maintenance_request_is_exempt()) {
            return;
        }

        $state = maintenance_mode_state($pdo);
        if (!$state['enabled']) {
            return;
        }

        $payload = [
            'success' => false,
            'code' => 'maintenance_mode',
            'message' => $state['message'],
            'maintenance_until' => $state['until'],
        ];

        header('Retry-After: 300');
        header('X-Maintenance-Mode: 1');

        if (function_exists('json_response')) {
            json_response($payload, 503);
        }

        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
