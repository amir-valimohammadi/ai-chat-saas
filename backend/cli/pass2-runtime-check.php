<?php

declare(strict_types=1);

// Runtime prerequisites check. No database connection is performed.
// Usage: php backend/cli/pass2-runtime-check.php [--json]

require_once __DIR__ . '/../config/app.php';

$jsonOnly = in_array('--json', $argv, true);
$checks = [];
$add = static function (string $name, bool $passed, string $actual, string $expected, string $level = 'required') use (&$checks): void {
    $checks[] = [
        'name' => $name,
        'status' => $passed ? 'passed' : ($level === 'required' ? 'failed' : 'warning'),
        'actual' => $actual,
        'expected' => $expected,
        'level' => $level,
    ];
};

$add('php.version', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION, '>= 8.1.0');

$requiredExtensions = [
    'json' => 'JSON request/response handling',
    'pdo' => 'PDO database abstraction',
    'pdo_mysql' => 'MariaDB/MySQL connection',
    'mbstring' => 'Persian/Unicode-safe string operations',
    'openssl' => 'Encryption and security operations',
    'fileinfo' => 'Secure upload MIME validation',
    'dom' => 'AI crawler HTML parsing',
];
foreach ($requiredExtensions as $extension => $purpose) {
    $add("php.extension.{$extension}", extension_loaded($extension), extension_loaded($extension) ? 'loaded' : 'missing', "loaded ({$purpose})");
}

$runnerScript = dirname(APP_ROOT) . '/qa-browser-runner/run.mjs';
$add(
    'project.qa_browser_runner',
    is_file($runnerScript),
    is_file($runnerScript) ? $runnerScript : 'missing',
    'qa-browser-runner/run.mjs (required only when Browser QA is enabled)',
    'recommended'
);

$recommendedExtensions = [
    'curl' => 'Reliable crawler and HTTP health probes',
    'sodium' => 'Modern cryptographic primitives',
    'opcache' => 'Production PHP performance',
];
foreach ($recommendedExtensions as $extension => $purpose) {
    $loaded = $extension === 'opcache'
        ? extension_loaded('Zend OPcache') || extension_loaded('opcache')
        : extension_loaded($extension);
    $add("php.extension.{$extension}", $loaded, $loaded ? 'loaded' : 'missing', "loaded ({$purpose})", 'recommended');
}

$requiredFunctions = ['random_bytes', 'password_hash', 'password_verify', 'hash_equals'];
foreach ($requiredFunctions as $function) {
    $add("php.function.{$function}", function_exists($function), function_exists($function) ? 'available' : 'missing', 'available');
}

$failed = count(array_filter($checks, static fn(array $row): bool => $row['status'] === 'failed'));
$warnings = count(array_filter($checks, static fn(array $row): bool => $row['status'] === 'warning'));
$report = [
    'generated_at' => date(DATE_ATOM),
    'status' => $failed > 0 ? 'failed' : ($warnings > 0 ? 'warning' : 'passed'),
    'summary' => ['total' => count($checks), 'failed' => $failed, 'warnings' => $warnings],
    'checks' => $checks,
];

if ($jsonOnly) {
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} else {
    echo "AI Chat SaaS - Pass 2 runtime check\n";
    foreach ($checks as $check) {
        echo sprintf('[%s] %s | %s | expected: %s%s', strtoupper($check['status']), $check['name'], $check['actual'], $check['expected'], PHP_EOL);
    }
}

exit($failed > 0 ? 1 : 0);
