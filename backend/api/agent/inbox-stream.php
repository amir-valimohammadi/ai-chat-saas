<?php

// Realtime invalidation stream for the authenticated agent inbox.

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
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
    'agent_inbox_stream',
    rate_limit_identifier((string) $user['id']),
    30,
    60,
    'Too many realtime connections. Please try again shortly.'
);

$accessSql = $user['role'] === 'agent'
    ? ' AND EXISTS (
            SELECT 1 FROM agent_site_access
            WHERE agent_site_access.site_id = conversations.site_id
              AND agent_site_access.user_id = :access_user_id
        )'
    : '';

$stateStmt = $pdo->prepare("
    SELECT
        COUNT(*) AS conversation_count,
        COALESCE(MAX(conversations.id), 0) AS last_conversation_id,
        COALESCE(MAX(UNIX_TIMESTAMP(conversations.updated_at)), 0) AS last_updated_at,
        COALESCE(MAX(UNIX_TIMESTAMP(conversations.last_message_at)), 0) AS last_message_at,
        COALESCE(SUM(CASE
            WHEN conversations.status <> 'closed' AND conversations.is_archived = 0 THEN 1
            ELSE 0
        END), 0) AS active_count
    FROM conversations
    INNER JOIN sites ON sites.id = conversations.site_id
    WHERE sites.tenant_id = :tenant_id
    {$accessSql}
");

$params = [':tenant_id' => (int) $user['tenant_id']];
if ($user['role'] === 'agent') {
    $params[':access_user_id'] = (int) $user['id'];
}

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
            realtime_stream_event('inbox.updated', [
                'version' => $fingerprint,
                'conversation_count' => (int) ($state['conversation_count'] ?? 0),
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
        'component' => 'agent_inbox_stream',
        'user_id' => (int) $user['id'],
    ]);
    realtime_stream_event('stream.error', ['message' => 'Realtime stream interrupted']);
}
