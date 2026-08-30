<?php

// Public realtime stream for one validated widget conversation.

declare(strict_types=1);

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/realtime-stream.php';
require_once __DIR__ . '/../../includes/error-handler.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$siteKey = trim((string) ($_GET['site_key'] ?? ''));
$visitorId = isset($_GET['visitor_id']) ? (int) $_GET['visitor_id'] : 0;
$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey) || $visitorId <= 0 || $conversationId <= 0) {
    json_response(['success' => false, 'message' => 'Invalid realtime stream parameters'], 422);
}

if (app_is_production() && empty($_SERVER['HTTP_ORIGIN'])) {
    json_response(['success' => false, 'message' => 'Origin is required'], 403);
}

$conversationStmt = $pdo->prepare("
    SELECT conversations.id, conversations.site_id, sites.domain AS site_domain
    FROM conversations
    INNER JOIN sites ON sites.id = conversations.site_id
    INNER JOIN tenants ON tenants.id = sites.tenant_id
    WHERE conversations.id = :conversation_id
      AND conversations.visitor_id = :visitor_id
      AND sites.site_key = :site_key
      AND sites.is_active = 1
      AND tenants.status = 'active'
    LIMIT 1
");
$conversationStmt->execute([
    ':conversation_id' => $conversationId,
    ':visitor_id' => $visitorId,
    ':site_key' => $siteKey,
]);
$conversation = $conversationStmt->fetch();

if (!$conversation) {
    json_response(['success' => false, 'message' => 'Conversation not found'], 404);
}

validate_widget_origin_or_fail($conversation['site_domain'] ?? null);

enforce_rate_limit(
    $pdo,
    'widget_conversation_stream',
    rate_limit_identifier($siteKey . '|' . $visitorId . '|' . $conversationId),
    30,
    60,
    'Too many realtime connections. Please try again shortly.'
);

$stateStmt = $pdo->prepare("
    SELECT
        conversations.status,
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

$typingStmt = $pdo->prepare("
    SELECT conversation_typing_status.actor_id, conversation_typing_status.updated_at, users.name AS agent_name
    FROM conversation_typing_status
    LEFT JOIN users ON users.id = conversation_typing_status.actor_id
    WHERE conversation_typing_status.conversation_id = :conversation_id
      AND conversation_typing_status.sender_type = 'agent'
      AND conversation_typing_status.is_typing = 1
      AND conversation_typing_status.updated_at >= (NOW() - INTERVAL 6 SECOND)
    ORDER BY conversation_typing_status.updated_at DESC
    LIMIT 1
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
$lastConversationFingerprint = preg_match('/^[a-f0-9]{64}$/', $resumeFingerprint) ? $resumeFingerprint : '';
$lastTypingFingerprint = '';
$lastHeartbeatAt = time();

try {
    while (!realtime_stream_is_disconnected() && (microtime(true) - $startedAt) < $duration) {
        $stateStmt->execute([':conversation_id' => $conversationId]);
        $state = $stateStmt->fetch();

        if (!$state) {
            realtime_stream_event('conversation.removed', ['conversation_id' => $conversationId]);
            break;
        }

        $conversationFingerprint = realtime_stream_fingerprint($state);
        if (!hash_equals($lastConversationFingerprint, $conversationFingerprint)) {
            $lastConversationFingerprint = $conversationFingerprint;
            realtime_stream_event('conversation.updated', [
                'conversation_id' => $conversationId,
                'version' => $conversationFingerprint,
                'last_message_id' => (int) $state['last_message_id'],
                'server_time' => date(DATE_ATOM),
            ], $conversationFingerprint);
        }

        $typingStmt->execute([':conversation_id' => $conversationId]);
        $typing = $typingStmt->fetch() ?: null;
        $typingState = [
            'is_typing' => $typing !== null,
            'actor_id' => $typing !== null ? (int) $typing['actor_id'] : null,
            'updated_at' => $typing['updated_at'] ?? null,
        ];
        $typingFingerprint = realtime_stream_fingerprint($typingState);

        if (!hash_equals($lastTypingFingerprint, $typingFingerprint)) {
            $lastTypingFingerprint = $typingFingerprint;
            $agentName = $typing['agent_name'] ?? null;
            realtime_stream_event('typing.updated', [
                'is_typing' => $typing !== null,
                'agent_name' => $agentName,
                'text' => $typing !== null
                    ? (($agentName ?: 'پشتیبان') . ' در حال نوشتن...')
                    : '',
            ]);
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
        'component' => 'widget_conversation_stream',
        'conversation_id' => $conversationId,
        'visitor_id' => $visitorId,
    ]);
    realtime_stream_event('stream.error', ['message' => 'Realtime stream interrupted']);
}
