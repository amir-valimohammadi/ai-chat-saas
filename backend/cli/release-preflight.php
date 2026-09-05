<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../includes/release-preflight.php';

// Read-only configuration gate. Explicit candidate files ignore process overrides.
// Without --env, evaluate backend/.env plus the real process environment.
$args = array_slice($argv, 1);
$envPath = dirname(__DIR__) . '/.env';
$frontendPath = dirname(__DIR__, 2) . '/frontend/.env.local';
$candidate = false;
$json = false;
try {
    for ($i = 0; $i < count($args); $i++) {
        if ($args[$i] === '--json') { $json = true; continue; }
        if (!in_array($args[$i], ['--env', '--frontend-env'], true) || !isset($args[$i + 1])) {
            throw new RuntimeException('Usage: php backend/cli/release-preflight.php [--env PATH --frontend-env PATH] [--json]');
        }
        if ($args[$i] === '--env') { $envPath = $args[++$i]; $candidate = true; }
        else { $frontendPath = $args[++$i]; }
    }
    $config = release_read_env($envPath);
    $frontend = release_read_env($frontendPath);
    if (!$candidate) {
        // The application gives process environment precedence over dotenv.
        $process = getenv();
        if (is_array($process)) {
            $config = array_replace($config, $process);
            if (isset($process['NEXT_PUBLIC_API_BASE_URL'])) $frontend['NEXT_PUBLIC_API_BASE_URL'] = $process['NEXT_PUBLIC_API_BASE_URL'];
        }
    }
    $checks = release_configuration_checks($config, $frontend);
    $failed = count(array_filter($checks, static fn($row) => $row['status'] === 'failed'));
    $report = [
        'status' => $failed ? 'failed' : 'passed',
        'mode' => $candidate ? 'candidate-files' : 'effective-local-configuration',
        'total' => count($checks), 'failed' => $failed,
        'scope' => 'Configuration only. Does not certify server security, TLS, database migrations, backups, load capacity or E2E behavior.',
        'checks' => $checks,
    ];
    if ($json) echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    else {
        echo "Release configuration gate: " . strtoupper($report['status']) . " ({$failed} failed)\n";
        foreach ($checks as $check) echo '[' . strtoupper($check['status']) . '] ' . $check['key'] . ($check['status'] === 'failed' ? ': ' . $check['hint'] : '') . PHP_EOL;
        echo $report['scope'] . PHP_EOL;
    }
    exit($failed ? 1 : 0);
} catch (Throwable $error) {
    // Messages contain key names only, never configuration values.
    $report = ['status' => 'failed', 'error' => $error->getMessage()];
    echo $json ? json_encode($report, JSON_PRETTY_PRINT) . PHP_EOL : $report['error'] . PHP_EOL;
    exit(2);
}
