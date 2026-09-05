<?php

declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../includes/release-preflight.php';

$valid = [
    'APP_ENV' => 'production', 'APP_DEBUG' => 'false',
    'JWT_SECRET' => bin2hex(random_bytes(32)), 'APP_ENCRYPTION_KEY' => bin2hex(random_bytes(32)),
    'SYSTEM_HEARTBEAT_SECRET' => bin2hex(random_bytes(32)),
    'APP_URL' => 'https://app.release-qa.net', 'FRONTEND_URL' => 'https://app.release-qa.net',
    'API_URL' => 'https://app.release-qa.net/backend/api', 'WIDGET_SCRIPT_URL' => 'https://app.release-qa.net/widget.js',
    'UPLOAD_PUBLIC_URL' => 'https://app.release-qa.net/backend',
    'PANEL_ALLOWED_ORIGINS' => 'https://app.release-qa.net', 'WIDGET_ALLOWED_ORIGINS' => '',
    'WIDGET_ALLOW_EMPTY_ORIGIN' => 'false', 'AUTH_COOKIE_SECURE' => 'true',
    'AUTH_COOKIE_SAMESITE' => 'Lax', 'AUTH_COOKIE_DOMAIN' => '', 'AUTH_COOKIE_PATH' => '/',
    'JWT_EXPIRATION_SECONDS' => '3600', 'JWT_MAX_TTL_SECONDS' => '86400',
    'DB_USER' => 'chat_application', 'DB_PASS' => bin2hex(random_bytes(16)), 'QA_BROWSER_AUTO_START' => 'false',
];
$frontend = ['NEXT_PUBLIC_API_BASE_URL' => $valid['API_URL']];
$count = 0;
$assert = static function (bool $condition, string $label) use (&$count): void {
    if (!$condition) throw new RuntimeException($label);
    $count++;
};
try {
    $checks = release_configuration_checks($valid, $frontend);
    $assert(count(array_filter($checks, static fn($row) => $row['status'] !== 'passed')) === 0, 'Valid candidate rejected.');
    foreach ([
        ['APP_ENV', 'local', 'environment'], ['APP_DEBUG', 'true', 'debug'],
        ['JWT_SECRET', str_repeat('a', 64), 'secret.JWT_SECRET'],
        ['APP_ENCRYPTION_KEY', $valid['JWT_SECRET'], 'secrets.independent'],
        ['SYSTEM_HEARTBEAT_SECRET', 'change_this_heartbeat_secret', 'secret.SYSTEM_HEARTBEAT_SECRET'],
        ['AUTH_COOKIE_SECURE', '0', 'cookie.secure'], ['AUTH_COOKIE_SAMESITE', 'None', 'cookie.same_site'],
        ['PANEL_ALLOWED_ORIGINS', '*', 'cors.panel'], ['PANEL_ALLOWED_ORIGINS', 'https://app.release-qa.net/', 'cors.panel'],
        ['WIDGET_ALLOW_EMPTY_ORIGIN', 'true', 'widget.empty_origin'], ['WIDGET_ALLOWED_ORIGINS', 'https://other.net', 'widget.global_origins'],
        ['DB_USER', 'root', 'database.account'], ['DB_PASS', 'REPLACE_WITH_DATABASE_PASSWORD', 'database.account'],
        ['JWT_EXPIRATION_SECONDS', '86401', 'session.ttl'],
        ['QA_BROWSER_AUTO_START', 'true', 'qa.auto_start'], ['API_URL', 'https://api.release-qa.net/backend/api', 'deployment.same_origin'],
    ] as [$key, $value, $expected]) {
        $rows = array_column(release_configuration_checks(array_replace($valid, [$key => $value]), $frontend), null, 'key');
        $assert($rows[$expected]['status'] === 'failed', 'Unsafe candidate accepted: ' . $expected);
    }
    foreach (['http://real.net', 'https://localhost', 'https://127.0.0.1', 'https://192.168.1.1',
        'https://app.example.com', 'https://staging.invalid', 'https://user:secret@real.net',
        'https://real.net/path?token=secret', 'javascript:alert(1)'] as $url) {
        $assert(!release_https_url($url), 'Invalid public URL accepted.');
    }
    $assert(!str_contains(json_encode($checks), $valid['JWT_SECRET']), 'Secret leaked into report.');
    $assert(!str_contains(json_encode($checks), $valid['DB_PASS']), 'Password leaked into report.');
    $temporary = tempnam(sys_get_temp_dir(), 'release-env-');
    if ($temporary === false) throw new RuntimeException('Could not create parser fixture.');
    try {
        file_put_contents($temporary, "# comment\nAPP_ENV=production\nAPP_NAME=\"Chat SaaS\"\nDB_PASS=\n");
        $assert(release_read_env($temporary) === ['APP_ENV' => 'production', 'APP_NAME' => 'Chat SaaS', 'DB_PASS' => ''], 'Environment parsing failed.');
        foreach (["SECRET=private-test-value\nSECRET=second\n", "private-test-value\n"] as $invalid) {
            file_put_contents($temporary, $invalid);
            $errorMessage = '';
            try { release_read_env($temporary); } catch (RuntimeException $error) { $errorMessage = $error->getMessage(); }
            $assert($errorMessage !== '' && !str_contains($errorMessage, 'private-test-value'), 'Invalid input accepted or leaked.');
        }
    } finally { unlink($temporary); }
    echo "Release preflight: {$count} assertions passed; no network or database access.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
