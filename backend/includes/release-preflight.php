<?php

declare(strict_types=1);

// Pure checks: never load application configuration, connect to a DB, or print secrets.
function release_read_env(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('Configuration file is missing or unreadable.');
    }
    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $index => $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!preg_match('/^([A-Z][A-Z0-9_]*)\s*=(.*)$/', $line, $match)) {
            throw new RuntimeException('Invalid environment entry at line ' . ($index + 1) . '; use KEY=value syntax.');
        }
        if (array_key_exists($match[1], $values)) {
            throw new RuntimeException('Duplicate environment key: ' . $match[1]);
        }
        // Match the application's dotenv quoting convention; no interpolation/evaluation.
        $values[$match[1]] = trim(trim($match[2]), "\"'");
    }
    return $values;
}

function release_https_url(string $value, bool $originOnly = false): bool
{
    if (!filter_var($value, FILTER_VALIDATE_URL)) return false;
    $parts = parse_url($value);
    if (!$parts || strtolower($parts['scheme'] ?? '') !== 'https') return false;
    if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) return false;
    $host = strtolower($parts['host'] ?? '');
    if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost')
        || str_ends_with($host, '.invalid') || str_ends_with($host, '.test')
        || $host === 'example.com' || str_ends_with($host, '.example.com')) return false;
    if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP)
        && !filter_var(trim($host, '[]'), FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    return !$originOnly || !isset($parts['path']) || $parts['path'] === '';
}

function release_secret_looks_configured(string $value): bool
{
    return strlen($value) >= 32 && count(array_unique(str_split($value))) >= 12
        && !preg_match('/change[_ -]?this|replace|your[_ -]|example|placeholder/i', $value);
}

function release_configuration_checks(array $config, array $frontend): array
{
    $checks = [];
    $add = static function (string $key, bool $pass, string $hint) use (&$checks): void {
        $checks[] = ['key' => $key, 'status' => $pass ? 'passed' : 'failed', 'hint' => $hint];
    };
    $get = static fn(string $key): string => trim((string) ($config[$key] ?? ''));
    $add('environment', $get('APP_ENV') === 'production', 'Staging must also run with APP_ENV=production.');
    $add('debug', strtolower($get('APP_DEBUG')) === 'false', 'Set APP_DEBUG=false explicitly.');
    foreach (['JWT_SECRET', 'APP_ENCRYPTION_KEY', 'SYSTEM_HEARTBEAT_SECRET'] as $key) {
        $add('secret.' . $key, release_secret_looks_configured($get($key)), 'Generate an independent random secret of at least 32 characters; do not reuse examples.');
    }
    $secrets = array_map($get, ['JWT_SECRET', 'APP_ENCRYPTION_KEY', 'SYSTEM_HEARTBEAT_SECRET']);
    $add('secrets.independent', count(array_unique($secrets)) === 3, 'Use different secrets for authentication, encryption and heartbeat.');
    foreach (['APP_URL', 'FRONTEND_URL', 'API_URL', 'WIDGET_SCRIPT_URL', 'UPLOAD_PUBLIC_URL'] as $key) {
        $add('https.' . $key, release_https_url($get($key)), 'Use an explicit HTTPS URL on the real deployment domain.');
    }
    $frontendApi = trim((string) ($frontend['NEXT_PUBLIC_API_BASE_URL'] ?? ''));
    $add('frontend.api', release_https_url($frontendApi) && $frontendApi === rtrim($get('API_URL'), '/'),
        'NEXT_PUBLIC_API_BASE_URL must equal API_URL without a trailing slash; rebuild Next after changing it.');
    $origins = array_values(array_filter(array_map('trim', explode(',', $get('PANEL_ALLOWED_ORIGINS')))));
    $add('cors.panel', $origins !== [] && count(array_filter($origins, static fn($origin) => release_https_url($origin, true))) === count($origins),
        'Use exact HTTPS panel origins without paths, trailing slash or wildcard.');
    $panel = parse_url($get('FRONTEND_URL')) ?: [];
    $panelOrigin = ($panel['scheme'] ?? '') . '://' . ($panel['host'] ?? '') . (isset($panel['port']) ? ':' . $panel['port'] : '');
    $add('cors.frontend_included', in_array($panelOrigin, $origins, true), 'Include the FRONTEND_URL origin in PANEL_ALLOWED_ORIGINS.');
    $add('widget.empty_origin', strtolower($get('WIDGET_ALLOW_EMPTY_ORIGIN')) === 'false', 'Set WIDGET_ALLOW_EMPTY_ORIGIN=false.');
    $add('widget.global_origins', $get('WIDGET_ALLOWED_ORIGINS') === '',
        'For this release, keep global widget origins empty: customer domains are checked per site; a global entry applies to every site.');
    $add('cookie.secure', strtolower($get('AUTH_COOKIE_SECURE')) === 'true', 'Set AUTH_COOKIE_SECURE=true.');
    $add('cookie.same_site', in_array(strtolower($get('AUTH_COOKIE_SAMESITE')), ['lax', 'strict'], true), 'Use Lax or Strict with the same-origin deployment described in the release guide.');
    $add('cookie.host_only', $get('AUTH_COOKIE_DOMAIN') === '', 'Keep AUTH_COOKIE_DOMAIN empty for host-only cookies.');
    $add('cookie.path', $get('AUTH_COOKIE_PATH') === '/', 'Use AUTH_COOKIE_PATH=/.');
    $api = parse_url($get('API_URL')) ?: [];
    $apiOrigin = ($api['scheme'] ?? '') . '://' . ($api['host'] ?? '') . (isset($api['port']) ? ':' . $api['port'] : '');
    $add('deployment.same_origin', $panelOrigin === $apiOrigin && release_https_url($panelOrigin, true),
        'This release profile serves panel and /backend/api through one HTTPS origin. Other topologies require separate cookie/CORS testing.');
    $ttl = filter_var($get('JWT_EXPIRATION_SECONDS'), FILTER_VALIDATE_INT);
    $maxTtl = filter_var($get('JWT_MAX_TTL_SECONDS'), FILTER_VALIDATE_INT);
    $add('session.ttl', $ttl !== false && $maxTtl !== false && $ttl >= 300 && $ttl <= $maxTtl && $maxTtl <= 86400,
        'Set session TTL between 300 and 86400 seconds and no greater than JWT_MAX_TTL_SECONDS.');
    $add('database.account', $get('DB_USER') !== '' && strtolower($get('DB_USER')) !== 'root'
        && strlen($get('DB_PASS')) >= 12 && !preg_match('/change[_ -]?this|replace|placeholder/i', $get('DB_PASS')),
        'Use a dedicated non-root database account with a password and only application-schema permissions.');
    $add('qa.auto_start', strtolower($get('QA_BROWSER_AUTO_START')) === 'false', 'Disable automatic browser QA worker launch on the customer-serving deployment.');
    return $checks;
}
