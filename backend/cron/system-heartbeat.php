<?php

// اجرای پیشنهادی هر دقیقه:
// php C:\xampp\htdocs\ai-chat-saas\backend\cron\system-heartbeat.php scheduler

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';

$serviceKey = preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) ($argv[1] ?? 'scheduler')));
$labels = [
    'scheduler' => 'Cron / Task Scheduler',
    'crawl_worker' => 'Crawler Worker',
    'notification_worker' => 'Notification Worker',
];
$serviceLabel = $labels[$serviceKey] ?? $serviceKey;

$stmt = $pdo->prepare("
    INSERT INTO system_service_heartbeats (
        service_key, service_label, status, message, metadata_json, last_seen_at
    ) VALUES (
        :service_key, :service_label, 'healthy', 'Heartbeat CLI دریافت شد.', :metadata_json, NOW()
    )
    ON DUPLICATE KEY UPDATE
        service_label = VALUES(service_label), status = 'healthy',
        message = VALUES(message), metadata_json = VALUES(metadata_json),
        last_seen_at = NOW(), updated_at = NOW()
");
$stmt->execute([
    ':service_key' => $serviceKey,
    ':service_label' => $serviceLabel,
    ':metadata_json' => json_encode([
        'php_version' => PHP_VERSION,
        'hostname' => gethostname() ?: null,
        'pid' => getmypid(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
]);

echo sprintf("[%s] heartbeat registered for %s\n", date('Y-m-d H:i:s'), $serviceKey);
