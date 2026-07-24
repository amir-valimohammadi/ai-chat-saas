<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/qa-browser.php';

$runId = isset($argv[1]) ? (int) $argv[1] : 0;
if ($runId < 1) {
    fwrite(STDERR, "Usage: php qa-browser-worker.php <run-id>\n");
    exit(2);
}

try {
    $token = qa_browser_worker_token_for_run($pdo, $runId);
    $node = (string) app_env('QA_BROWSER_NODE_BINARY', 'node');
    $script = qa_browser_runner_root() . '/run.mjs';
    if (!is_file($script)) {
        throw new RuntimeException('فایل Node Runner پیدا نشد: ' . $script);
    }

    $command = escapeshellarg($node) . ' ' . escapeshellarg($script)
        . ' --run-id=' . $runId;

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $baseEnvironment = getenv();
    if (!is_array($baseEnvironment)) {
        $baseEnvironment = [];
    }
    $environment = array_merge($baseEnvironment, $_ENV, [
        'QA_BROWSER_API_URL' => qa_browser_api_url(),
        'QA_BROWSER_WORKER_TOKEN' => $token,
    ]);
    $process = proc_open($command, $descriptors, $pipes, qa_browser_runner_root(), $environment);
    if (!is_resource($process)) {
        throw new RuntimeException('اجرای Node Runner آغاز نشد.');
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        $message = trim($stderr !== '' ? $stderr : $stdout);
        qa_browser_cleanup_fixture($pdo, $runId);
        qa_browser_finalize_run($pdo, $runId, 'failed', substr($message ?: 'Browser runner failed.', 0, 4000));
        fwrite(STDERR, $message . "\n");
        exit($exitCode ?: 1);
    }
    fwrite(STDOUT, trim($stdout) . "\n");
} catch (Throwable $e) {
    try {
        qa_browser_cleanup_fixture($pdo, $runId);
        qa_browser_finalize_run($pdo, $runId, 'failed', $e->getMessage());
    } catch (Throwable) {
        // Best effort only.
    }
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
