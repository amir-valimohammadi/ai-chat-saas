<?php

// مسیر فایل: ai-chat-saas/backend/config/app.php
// هدف: تنظیمات عمومی پروژه، خواندن .env و سازگاری با کدهای قدیمی که array config می‌خواهند

if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__));
}

if (!isset($GLOBALS['app_env_file_values']) || !is_array($GLOBALS['app_env_file_values'])) {
    $GLOBALS['app_env_file_values'] = [];
}

if (!function_exists('app_load_env')) {
    function app_load_env(string $path): void
    {
        static $loadedPaths = [];

        if (isset($loadedPaths[$path])) {
            return;
        }

        $loadedPaths[$path] = true;

        if (!file_exists($path) || !is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

        if (!$lines) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);

            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            if (!str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);

            $key = trim($key);
            $value = trim($value);

            if ($key === '') {
                continue;
            }

            $value = trim($value, "\"'");

            if (getenv($key) === false) {
                // Keep file-backed values request-local. putenv() mutates process state
                // and is unreliable under Windows Apache's threaded MPM.
                $GLOBALS['app_env_file_values'][$key] = $value;
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
            }
        }
    }
}

app_load_env(APP_ROOT . '/.env');

if (!function_exists('app_env')) {
    function app_env(string $key, mixed $default = null): mixed
    {
        $value = getenv($key);

        if ($value === false) {
            $fileValues = $GLOBALS['app_env_file_values'] ?? [];
            if (!is_array($fileValues) || !array_key_exists($key, $fileValues)) {
                return $default;
            }
            $value = $fileValues[$key];
        }

        $lowerValue = strtolower((string) $value);

        if ($lowerValue === 'true') {
            return true;
        }

        if ($lowerValue === 'false') {
            return false;
        }

        if ($lowerValue === 'null') {
            return null;
        }

        return $value;
    }
}

$appConfig = [
    'name' => app_env('APP_NAME', 'AI Chat SaaS'),
    'env' => app_env('APP_ENV', 'local'),
    'debug' => app_env('APP_DEBUG', true),
    'url' => app_env('APP_URL', 'http://localhost:3000'),
    'api_url' => app_env('API_URL', 'http://localhost/ai-chat-saas/backend/api'),
    'widget_script_url' => app_env(
        'WIDGET_SCRIPT_URL',
        'http://localhost/ai-chat-saas/widget/dist/widget.js'
    ),
    'frontend_url' => app_env('FRONTEND_URL', 'http://localhost:3000'),
    'timezone' => app_env('APP_TIMEZONE', 'Asia/Tehran'),

    'jwt_secret' => app_env('JWT_SECRET', 'change_this_secret'),

    // Access tokenها حداکثر یک روز معتبر می‌مانند. برای Production می‌توان
    // JWT_EXPIRATION_SECONDS را کوتاه‌تر (مثلاً یک ساعت) تنظیم کرد.
    'jwt_expiration_seconds' => (int) app_env('JWT_EXPIRATION_SECONDS', 86400),
    'jwt_max_ttl_seconds' => (int) app_env('JWT_MAX_TTL_SECONDS', 86400),
    'jwt_issuer' => app_env('JWT_ISSUER', 'ai-chat-saas'),
    'jwt_audience' => app_env('JWT_AUDIENCE', 'ai-chat-saas-panel'),
];

if (!function_exists('app_is_production')) {
    function app_is_production(): bool
    {
        return app_env('APP_ENV', 'local') === 'production';
    }
}

if (!function_exists('app_debug_enabled')) {
    function app_debug_enabled(): bool
    {
        return app_env('APP_DEBUG', true) === true;
    }
}

if (!function_exists('app_config')) {
    function app_config(string $key, mixed $default = null): mixed
    {
        global $appConfig;

        return $appConfig[$key] ?? $default;
    }
}

if (!defined('APP_REQUEST_ID')) {
    $incomingRequestId = trim((string) ($_SERVER['HTTP_X_REQUEST_ID'] ?? ''));
    if ($incomingRequestId !== '' && preg_match('/^[A-Za-z0-9._:-]{8,100}$/', $incomingRequestId)) {
        define('APP_REQUEST_ID', $incomingRequestId);
    } else {
        try {
            define('APP_REQUEST_ID', bin2hex(random_bytes(16)));
        } catch (Throwable) {
            define('APP_REQUEST_ID', str_replace('.', '', uniqid('req_', true)));
        }
    }
}

if (!function_exists('app_request_id')) {
    function app_request_id(): string
    {
        return (string) APP_REQUEST_ID;
    }
}

if (!function_exists('app_validate_production_security')) {
    function app_validate_production_security(): void
    {
        if (!app_is_production()) {
            return;
        }

        $problems = [];
        $jwtSecret = trim((string) app_config('jwt_secret', ''));
        $encryptionKey = trim((string) app_env('APP_ENCRYPTION_KEY', ''));

        if (app_debug_enabled()) {
            $problems[] = 'APP_DEBUG must be false';
        }

        if (strlen($jwtSecret) < 32 || str_contains(strtolower($jwtSecret), 'change_this')) {
            $problems[] = 'JWT_SECRET must be a random value with at least 32 characters';
        }

        if (strlen($encryptionKey) < 32 || str_contains(strtolower($encryptionKey), 'change_this')) {
            $problems[] = 'APP_ENCRYPTION_KEY must be a separate random value with at least 32 characters';
        } elseif (hash_equals($jwtSecret, $encryptionKey)) {
            $problems[] = 'APP_ENCRYPTION_KEY must be different from JWT_SECRET';
        }

        if (app_env('WIDGET_ALLOW_EMPTY_ORIGIN', false) === true) {
            $problems[] = 'WIDGET_ALLOW_EMPTY_ORIGIN must be false';
        }

        if (app_env('AUTH_COOKIE_SECURE', null) === false) {
            $problems[] = 'AUTH_COOKIE_SECURE must not be false in production';
        }

        if (!$problems) {
            return;
        }

        error_log('[AI_CHAT_SAAS_SECURITY] Unsafe production configuration: ' . implode('; ', $problems));

        if (PHP_SAPI === 'cli') {
            throw new RuntimeException('Unsafe production configuration. Check the server error log.');
        }

        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }

        header('X-Request-ID: ' . app_request_id());
        echo json_encode([
            'success' => false,
            'message' => 'Server security configuration is incomplete.',
            'request_id' => app_request_id(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
}

app_validate_production_security();

date_default_timezone_set((string) app_config('timezone', 'Asia/Tehran'));

return $appConfig;
