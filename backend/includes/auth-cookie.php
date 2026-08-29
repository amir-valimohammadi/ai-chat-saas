<?php

// Secure cookie transport and CSRF protection for panel authentication.

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';

if (!function_exists('auth_cookie_setting_name')) {
    function auth_cookie_setting_name(string $envKey, string $default): string
    {
        $value = trim((string) app_env($envKey, $default));
        return preg_match('/^[A-Za-z0-9_-]{1,64}$/', $value) ? $value : $default;
    }
}

if (!function_exists('auth_session_cookie_name')) {
    function auth_session_cookie_name(bool $impersonation = false): string
    {
        return $impersonation
            ? auth_cookie_setting_name('AUTH_IMPERSONATION_COOKIE_NAME', 'ai_chat_impersonation')
            : auth_cookie_setting_name('AUTH_COOKIE_NAME', 'ai_chat_auth');
    }
}

if (!function_exists('auth_csrf_cookie_name')) {
    function auth_csrf_cookie_name(bool $impersonation = false): string
    {
        return $impersonation
            ? auth_cookie_setting_name('AUTH_IMPERSONATION_CSRF_COOKIE_NAME', 'ai_chat_impersonation_csrf')
            : auth_cookie_setting_name('AUTH_CSRF_COOKIE_NAME', 'ai_chat_csrf');
    }
}

if (!function_exists('auth_cookie_secure')) {
    function auth_cookie_secure(): bool
    {
        $configured = app_env('AUTH_COOKIE_SECURE', null);
        if ($configured !== null) {
            return filter_var($configured, FILTER_VALIDATE_BOOL);
        }

        $forwardedProto = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
        return app_is_production()
            || (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
            || $forwardedProto === 'https';
    }
}

if (!function_exists('auth_cookie_same_site')) {
    function auth_cookie_same_site(): string
    {
        $configured = strtolower(trim((string) app_env('AUTH_COOKIE_SAMESITE', 'Lax')));
        $sameSite = match ($configured) {
            'strict' => 'Strict',
            'none' => 'None',
            default => 'Lax',
        };

        // Browsers reject SameSite=None cookies without Secure.
        return $sameSite === 'None' && !auth_cookie_secure() ? 'Lax' : $sameSite;
    }
}

if (!function_exists('auth_cookie_options')) {
    function auth_cookie_options(int $expires, bool $httpOnly): array
    {
        $options = [
            'expires' => $expires,
            'path' => trim((string) app_env('AUTH_COOKIE_PATH', '/')) ?: '/',
            'secure' => auth_cookie_secure(),
            'httponly' => $httpOnly,
            'samesite' => auth_cookie_same_site(),
        ];
        $domain = trim((string) app_env('AUTH_COOKIE_DOMAIN', ''));
        if ($domain !== '') {
            $options['domain'] = $domain;
        }
        return $options;
    }
}

if (!function_exists('auth_request_uses_impersonation')) {
    function auth_request_uses_impersonation(): bool
    {
        return strtolower(trim((string) ($_SERVER['HTTP_X_AUTH_CONTEXT'] ?? ''))) === 'impersonation';
    }
}

if (!function_exists('auth_cookie_token_for_request')) {
    function auth_cookie_token_for_request(): ?string
    {
        $name = auth_session_cookie_name(auth_request_uses_impersonation());
        $token = trim((string) ($_COOKIE[$name] ?? ''));
        return $token !== '' && strlen($token) <= 4096 ? $token : null;
    }
}

if (!function_exists('auth_set_session_cookies')) {
    function auth_set_session_cookies(array $session, bool $impersonation = false): string
    {
        $token = trim((string) ($session['token'] ?? ''));
        $expires = strtotime((string) ($session['expires_at'] ?? '')) ?: 0;
        if ($token === '' || $expires <= time()) {
            throw new InvalidArgumentException('A valid session token and expiration are required.');
        }

        $csrfToken = bin2hex(random_bytes(32));
        $sessionName = auth_session_cookie_name($impersonation);
        $csrfName = auth_csrf_cookie_name($impersonation);
        setcookie($sessionName, $token, auth_cookie_options($expires, true));
        setcookie($csrfName, $csrfToken, auth_cookie_options($expires, false));
        $_COOKIE[$sessionName] = $token;
        $_COOKIE[$csrfName] = $csrfToken;
        return $csrfToken;
    }
}

if (!function_exists('auth_ensure_csrf_token')) {
    function auth_ensure_csrf_token(bool $impersonation = false): string
    {
        $csrfName = auth_csrf_cookie_name($impersonation);
        $existing = trim((string) ($_COOKIE[$csrfName] ?? ''));
        if (preg_match('/^[a-f0-9]{64}$/', $existing)) {
            return $existing;
        }

        $ttl = max(300, (int) app_config('jwt_expiration_seconds', 86400));
        $csrfToken = bin2hex(random_bytes(32));
        setcookie($csrfName, $csrfToken, auth_cookie_options(time() + $ttl, false));
        $_COOKIE[$csrfName] = $csrfToken;
        return $csrfToken;
    }
}

if (!function_exists('auth_validate_csrf_request')) {
    function auth_validate_csrf_request(bool $impersonation = false): void
    {
        if (in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }

        $cookieToken = trim((string) ($_COOKIE[auth_csrf_cookie_name($impersonation)] ?? ''));
        $headerToken = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
        if (
            !preg_match('/^[a-f0-9]{64}$/', $cookieToken)
            || !preg_match('/^[a-f0-9]{64}$/', $headerToken)
            || !hash_equals($cookieToken, $headerToken)
        ) {
            json_response([
                'success' => false,
                'message' => 'CSRF token is missing or invalid. Refresh the page and try again.',
                'code' => 'csrf_token_invalid',
            ], 403);
        }
    }
}

if (!function_exists('auth_clear_session_cookies')) {
    function auth_clear_session_cookies(bool $impersonation = false): void
    {
        $expired = time() - 3600;
        foreach ([auth_session_cookie_name($impersonation), auth_csrf_cookie_name($impersonation)] as $name) {
            setcookie($name, '', auth_cookie_options($expired, $name === auth_session_cookie_name($impersonation)));
            unset($_COOKIE[$name]);
        }
    }
}
