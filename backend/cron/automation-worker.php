<?php

// اجرای پیشنهادی هر دقیقه:
// C:\xampp\php\php.exe C:\xampp\htdocs\ai-chat-saas\backend\cron\automation-worker.php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/automation.php';

$limit = max(1, min(1000, (int) ($argv[1] ?? 250)));
$startedAt = microtime(true);

try {
    $result = automation_run_scheduled($pdo, $limit);
    $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

    $heartbeat = $pdo->prepare("
        INSERT INTO system_service_heartbeats (
            service_key, service_label, status, message, metadata_json, last_seen_at
        ) VALUES (
            'automation_worker', 'Automation Worker', 'healthy', :message, :metadata_json, NOW()
        )
        ON DUPLICATE KEY UPDATE
            status = 'healthy', message = VALUES(message), metadata_json = VALUES(metadata_json),
            last_seen_at = NOW(), updated_at = NOW()
    ");
    $heartbeat->execute([
        ':message' => 'پردازش قوانین زمان‌بندی‌شده و SLA انجام شد.',
        ':metadata_json' => json_encode(['duration_ms' => $durationMs, 'result' => $result], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);

    echo json_encode(['success' => true, 'duration_ms' => $durationMs, 'result' => $result], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    try {
        $heartbeat = $pdo->prepare("
            INSERT INTO system_service_heartbeats (service_key, service_label, status, message, metadata_json, last_seen_at)
            VALUES ('automation_worker', 'Automation Worker', 'down', :message, :metadata_json, NOW())
            ON DUPLICATE KEY UPDATE status = 'down', message = VALUES(message), metadata_json = VALUES(metadata_json), last_seen_at = NOW(), updated_at = NOW()
        ");
        $heartbeat->execute([
            ':message' => mb_substr($e->getMessage(), 0, 500, 'UTF-8'),
            ':metadata_json' => json_encode(['exception' => get_class($e)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    } catch (Throwable) {
        // خطای heartbeat نباید خطای اصلی را پنهان کند.
    }
    fwrite(STDERR, '[automation-worker] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

