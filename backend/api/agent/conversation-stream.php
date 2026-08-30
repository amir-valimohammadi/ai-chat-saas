<?php

// Realtime invalidation stream for one authenticated agent conversation.

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/realtime-stream.php';
require_once __DIR__ . '/../../includes/error-handler.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;
if ($conversationId <= 0) {
    json_response(['success' => false, 'message' => 'conversation_id is required'], 422);
}

$conversationStmt = $pdo->prepare('SELECT id, site_id FROM conversations WHERE id = :id LIMIT 1');
$conversationStmt->execute([':id' => $conversationId]);
$conversation = $conversationStmt->fetch();
if (!$conversation) {
    json_response(['success' => false, 'message' => 'Conversation not found'], 404);
}

require_site_access($pdo, $user, (int) $conversation['site_id']);

enforce_rate_limit(
    $pdo,
    'agent_conversation_stream',
    rate_limit_identifier((string) $user['id'] . '|' . $conversationId),
    30,
    60,
    'Too many realtime connections. Please try again shortly.'
);

$stateStmt = $pdo->prepare("
    SELECT
        conversations.status,
        conversations.priority,
        conversations.is_pinned,
        conversations.is_archived,
        conversations.assigned_agent_id,
        conversations.department_id,
        conversations.queue_status,
        conversations.queue_position,
        conversations.updated_at,
        conversations.last_message_at,
        COALESCE(MAX(messages.id), 0) AS last_message_id,
        COALESCE(MAX(UNIX_TIMESTAMP(messages.edited_at)), 0) AS last_edited_at,
        COALESCE(MAX(UNIX_TIMESTAMP(messages.deleted_at)), 0) AS last_deleted_at,
        COALESCE(MAX(UNIX_TIMESTAMP(messages.interaction_updated_at)), 0) AS last_interaction_at,
        COALESCE(MAX(UNIX_TIMESTAMP(messages.delivered_at)), 0) AS last_delivered_at,
        COALESCE(MAX(UNIX_TIMESTAMP(messages.read_at)), 0) AS last_read_at
    FROM conversations
    LEFT JOIN messages ON messages.conversation_id = conversations.id
    WHERE conversations.id = :conversation_id
    GROUP BY conversations.id
");

realtime_stream_prepare();
realtime_stream_event('ready', [
    'conversation_id' => $conversationId,
    'server_time' => date(DATE_ATOM),
]);

$startedAt = microtime(true);
$duration = realtime_stream_duration_seconds();
$interval = realtime_stream_poll_interval_microseconds();
$resumeFingerprint = trim((string) ($_SERVER['HTTP_LAST_EVENT_ID'] ?? ''));
$lastFingerprint = preg_match('/^[a-f0-9]{64}$/', $resumeFingerprint) ? $resumeFingerprint : '';
$lastHeartbeatAt = time();

try {
    while (!realtime_stream_is_disconnected() && (microtime(true) - $startedAt) < $duration) {
        $stateStmt->execute([':conversation_id' => $conversationId]);
        $state = $stateStmt->fetch();

        if (!$state) {
            realtime_stream_event('conversation.removed', ['conversation_id' => $conversationId]);
            break;
        }

        $fingerprint = realtime_stream_fingerprint($state);
        if (!hash_equals($lastFingerprint, $fingerprint)) {
            $lastFingerprint = $fingerprint;
            realtime_stream_event('conversation.updated', [
                'conversation_id' => $conversationId,
                'version' => $fingerprint,
                'last_message_id' => (int) $state['last_message_id'],
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
        'component' => 'agent_conversation_stream',
        'conversation_id' => $conversationId,
        'user_id' => (int) $user['id'],
    ]);
    realtime_stream_event('stream.error', ['message' => 'Realtime stream interrupted']);
}
