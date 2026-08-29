<?php

// Toggle one supported emoji reaction for the authenticated agent.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();
$messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;
$emoji = validate_message_reaction_or_fail((string) ($input['emoji'] ?? ''));

if ($messageId <= 0) {
    json_response(['success' => false, 'message' => 'message_id is required'], 422);
}

enforce_rate_limit(
    $pdo,
    'agent_message_reaction_toggle',
    rate_limit_identifier('user:' . $user['id']),
    120,
    5 * 60,
    'Too many reaction changes. Please slow down.'
);

try {
    $messageStmt = $pdo->prepare("
        SELECT
            messages.id,
            messages.deleted_at,
            conversations.site_id
        FROM messages
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        WHERE messages.id = :message_id
        LIMIT 1
    ");
    $messageStmt->execute([':message_id' => $messageId]);
    $message = $messageStmt->fetch();

    if (!$message) {
        json_response(['success' => false, 'message' => 'Message not found'], 404);
    }

    require_site_access($pdo, $user, (int) $message['site_id']);

    if ($message['deleted_at'] !== null) {
        json_response(['success' => false, 'message' => 'Deleted messages cannot be reacted to'], 422);
    }

    $pdo->beginTransaction();

    $existingStmt = $pdo->prepare("
        SELECT id
        FROM message_reactions
        WHERE message_id = :message_id
          AND actor_type = 'agent'
          AND actor_id = :actor_id
          AND emoji = :emoji
        LIMIT 1
        FOR UPDATE
    ");
    $existingStmt->execute([
        ':message_id' => $messageId,
        ':actor_id' => $user['id'],
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
            VALUES (:message_id, 'agent', :actor_id, :emoji)
        ");
        $insertStmt->execute([
            ':message_id' => $messageId,
            ':actor_id' => $user['id'],
            ':emoji' => $emoji,
        ]);
        $active = true;
    }

    $touchStmt = $pdo->prepare('UPDATE messages SET interaction_updated_at = NOW() WHERE id = :message_id');
    $touchStmt->execute([':message_id' => $messageId]);

    $pdo->commit();

    $reactions = message_reactions_by_message_ids($pdo, [$messageId], 'agent', (int) $user['id']);

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
        safe_api_exception_context($e);
    }
    json_response($payload, 500);
}
