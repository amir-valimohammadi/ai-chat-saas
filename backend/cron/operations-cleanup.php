<?php

// اجرای پیشنهادی روزانه برای پاک‌سازی داده‌های عملیاتی قدیمی

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';

$queries = [
    'request_logs' => "DELETE FROM system_request_logs WHERE occurred_at < DATE_SUB(NOW(), INTERVAL 30 DAY)",
    'resolved_errors' => "DELETE FROM system_error_logs WHERE resolved_at IS NOT NULL AND resolved_at < DATE_SUB(NOW(), INTERVAL 90 DAY)",
    'rate_limits' => "DELETE FROM api_rate_limits WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)",
];

foreach ($queries as $label => $sql) {
    $affected = $pdo->exec($sql);
    echo sprintf("[%s] %s: %d row(s) removed\n", date('Y-m-d H:i:s'), $label, (int) $affected);
}
