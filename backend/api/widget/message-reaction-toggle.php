<?php

// Toggle one supported emoji reaction for the current widget visitor.

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$siteKey = trim((string) ($input['site_key'] ?? ''));
$visitorId = isset($input['visitor_id']) ? (int) $input['visitor_id'] : 0;
$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;
$emoji = validate_message_reaction_or_fail((string) ($input['emoji'] ?? ''));

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0 || $messageId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_key, visitor_id, conversation_id and message_id are required',
    ], 422);
}

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response(['success' => false, 'message' => 'Invalid site_key'], 422);
}

enforce_rate_limit(
    $pdo,
    'widget_message_reaction_toggle',
    rate_limit_identifier($siteKey . '|' . $visitorId . '|' . $conversationId),
    80,
    5 * 60,
    'Too many reaction changes. Please slow down.'
);

try {
    $messageStmt = $pdo->prepare("
        SELECT
            messages.id,
            messages.deleted_at,
            messages.message_type,
            sites.domain
        FROM messages
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE messages.id = :message_id
          AND messages.conversation_id = :conversation_id
          AND conversations.visitor_id = :visitor_id
          AND sites.site_key = :site_key
          AND sites.is_active = 1
          AND tenants.status = 'active'
        LIMIT 1
    ");
    $messageStmt->execute([
        ':message_id' => $messageId,
        ':conversation_id' => $conversationId,
        ':visitor_id' => $visitorId,
        ':site_key' => $siteKey,
    ]);
    $message = $messageStmt->fetch();

    if (!$message) {
        json_response(['success' => false, 'message' => 'Message not found'], 404);
    }

    validate_widget_origin_or_fail($message['domain']);

    if ($message['deleted_at'] !== null || $message['message_type'] === 'internal_note') {
        json_response(['success' => false, 'message' => 'This message cannot be reacted to'], 422);
    }

    $pdo->beginTransaction();

    $existingStmt = $pdo->prepare("
        SELECT id
        FROM message_reactions
        WHERE message_id = :message_id
          AND actor_type = 'visitor'
          AND actor_id = :actor_id
          AND emoji = :emoji
        LIMIT 1
        FOR UPDATE
    ");
    $existingStmt->execute([
        ':message_id' => $messageId,
        ':actor_id' => $visitorId,
        ':emoji' => $emoji,
    ]);
    $existingId = $existingStmt->fetchColumn();

    if ($existingId) {
        $deleteStmt = $pdo->prepare('DELETE FROM message_reactions WHERE id = :id');
        $deleteStmt->execute([':id' => $existingId]);
        $active = false;
    } else {
        $insertStmt = $pdo->prepare("
            INSERT INTO message_reactions (message_id, actor_type, actor_id, emoji)
            VALUES (:message_id, 'visitor', :actor_id, :emoji)
        ");
        $insertStmt->execute([
            ':message_id' => $messageId,
            ':actor_id' => $visitorId,
            ':emoji' => $emoji,
        ]);
        $active = true;
    }

    $touchStmt = $pdo->prepare('UPDATE messages SET interaction_updated_at = NOW() WHERE id = :message_id');
    $touchStmt->execute([':message_id' => $messageId]);

    $pdo->commit();

    $reactions = message_reactions_by_message_ids($pdo, [$messageId], 'visitor', $visitorId);

    json_response([
        'success' => true,
        'active' => $active,
        'message_id' => $messageId,
        'emoji' => $emoji,
        'reactions' => $reactions[$messageId] ?? [],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = ['success' => false, 'message' => 'Failed to update reaction'];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
