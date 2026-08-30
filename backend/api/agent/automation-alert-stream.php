<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/automation.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/realtime-stream.php';
require_once __DIR__ . '/../../includes/error-handler.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

enforce_rate_limit(
    $pdo,
    'agent_automation_alert_stream',
    rate_limit_identifier((string) $user['id']),
    30,
    60,
    'Too many realtime connections. Please try again shortly.'
);

$recipientSql = $user['role'] === 'customer_admin'
    ? ' AND (recipient_user_id IS NULL OR recipient_user_id = :recipient_user_id) '
    : ' AND recipient_user_id = :recipient_user_id ';
$params = [
    ':tenant_id' => (int) $user['tenant_id'],
    ':recipient_user_id' => (int) $user['id'],
];
$stateStmt = $pdo->prepare("
    SELECT COUNT(*) AS total_count,
           COALESCE(SUM(is_read = 0), 0) AS unread_count,
           COALESCE(MAX(id), 0) AS latest_id,
           COALESCE(MAX(UNIX_TIMESTAMP(read_at)), 0) AS latest_read_at
    FROM automation_alerts
    WHERE tenant_id = :tenant_id {$recipientSql}
");
$alertsStmt = $pdo->prepare("
    SELECT id, conversation_id, severity, title, message, is_read, created_at
    FROM automation_alerts
    WHERE tenant_id = :tenant_id {$recipientSql}
    ORDER BY id DESC
    LIMIT 20
");

realtime_stream_prepare();
realtime_stream_event('ready', ['server_time' => date(DATE_ATOM)]);

$startedAt = microtime(true);
$duration = realtime_stream_duration_seconds();
$interval = realtime_stream_poll_interval_microseconds();
$resumeFingerprint = trim((string) ($_SERVER['HTTP_LAST_EVENT_ID'] ?? ''));
$lastFingerprint = preg_match('/^[a-f0-9]{64}$/', $resumeFingerprint) ? $resumeFingerprint : '';
$lastHeartbeatAt = time();

try {
    while (!realtime_stream_is_disconnected() && (microtime(true) - $startedAt) < $duration) {
        $stateStmt->execute($params);
        $state = $stateStmt->fetch() ?: [];
        $fingerprint = realtime_stream_fingerprint($state);

        if (!hash_equals($lastFingerprint, $fingerprint)) {
            $lastFingerprint = $fingerprint;
            $alertsStmt->execute($params);
            $alerts = array_map(static fn(array $row): array => [
                'id' => (int) $row['id'],
                'conversation_id' => $row['conversation_id'] !== null ? (int) $row['conversation_id'] : null,
                'severity' => $row['severity'],
                'title' => $row['title'],
                'message' => $row['message'],
                'is_read' => (bool) $row['is_read'],
                'created_at' => $row['created_at'],
            ], $alertsStmt->fetchAll());

            realtime_stream_event('automation.alerts', [
                'alerts' => $alerts,
                'unread_count' => (int) ($state['unread_count'] ?? 0),
                'server_time' => date(DATE_ATOM),
            ], $fingerprint);
        }

        if (time() - $lastHeartbeatAt >= 10) {
            realtime_stream_heartbeat();
            $lastHeartbeatAt = time();
        }

        usleep($interval);
    }

    if (!realtime_stream_is_disconnected()) {
        realtime_stream_event('reconnect', ['retry_after_ms' => 250]);
    }
} catch (Throwable $e) {
    app_log_error($e, [
        'component' => 'automation_alert_stream',
        'user_id' => (int) $user['id'],
    ]);
    realtime_stream_event('stream.error', ['message' => 'Realtime stream interrupted']);
}
