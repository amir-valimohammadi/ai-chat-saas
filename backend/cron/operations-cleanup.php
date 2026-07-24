<?php

// اجرای پیشنهادی روزانه برای پاک‌سازی داده‌های عملیاتی قدیمی

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/admin-impersonation.php';

$impersonationResult = admin_impersonation_expire_stale($pdo);
foreach ($impersonationResult as $label => $affected) {
    echo sprintf(
        "[%s] impersonation_%s: %d row(s) affected\n",
        date('Y-m-d H:i:s'),
        $label,
        (int) $affected
    );
}

$queries = [
    'request_logs' => "DELETE FROM system_request_logs WHERE occurred_at < DATE_SUB(NOW(), INTERVAL 30 DAY)",
    'resolved_errors' => "DELETE FROM system_error_logs WHERE resolved_at IS NOT NULL AND resolved_at < DATE_SUB(NOW(), INTERVAL 90 DAY)",
    'rate_limits' => "DELETE FROM api_rate_limits WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)",
    'expired_auth_sessions' => "DELETE FROM auth_sessions WHERE expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY) OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 90 DAY))",
    'login_attempts' => "DELETE FROM admin_login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY)",
    'resolved_security_events' => "DELETE FROM admin_security_events WHERE resolved_at IS NOT NULL AND resolved_at < DATE_SUB(NOW(), INTERVAL 365 DAY)",
    'old_impersonation_records' => "DELETE FROM admin_impersonations WHERE status IN ('ended','expired','revoked') AND COALESCE(ended_at,created_at) < DATE_SUB(NOW(), INTERVAL 365 DAY)",
];

foreach ($queries as $label => $sql) {
    $affected = $pdo->exec($sql);
    echo sprintf("[%s] %s: %d row(s) removed\n", date('Y-m-d H:i:s'), $label, (int) $affected);
}
