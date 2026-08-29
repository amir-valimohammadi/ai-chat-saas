<?php

// Edit an agent's own recent message and preserve revision/mention history.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();

$messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;
$content = trim((string) ($input['content'] ?? ''));
$mentionedUserIds = normalize_mentioned_user_ids($input['mentioned_user_ids'] ?? []);

if ($messageId <= 0 || $content === '') {
    json_response(['success' => false, 'message' => 'message_id and content are required'], 422);
}

if (mb_strlen($content, 'UTF-8') > 5000) {
    json_response(['success' => false, 'message' => 'Message is too long'], 422);
}

try {
    $stmt = $pdo->prepare("
        SELECT
            messages.*,
            conversations.site_id,
            conversations.status AS conversation_status,
            sites.tenant_id AS site_tenant_id
        FROM messages
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE messages.id = :message_id
        LIMIT 1
    ");
    $stmt->execute([':message_id' => $messageId]);
    $message = $stmt->fetch();

    if (!$message) {
        json_response(['success' => false, 'message' => 'Message not found'], 404);
    }

    require_site_access($pdo, $user, (int) $message['site_id']);

    if ($message['conversation_status'] === 'closed') {
        json_response(['success' => false, 'message' => 'This conversation is closed'], 422);
    }

    if (!message_can_be_modified_by($message, 'agent', (int) $user['id'])) {
        json_response([
            'success' => false,
            'message' => 'This message can no longer be edited or does not belong to you',
        ], 403);
    }

    $mentionedUsers = $message['message_type'] === 'internal_note'
        ? validate_mentioned_users_or_fail(
            $pdo,
            $mentionedUserIds,
            (int) $message['site_tenant_id'],
            (int) $message['site_id']
        )
        : [];

    $pdo->beginTransaction();

    if ($content !== trim((string) $message['content'])) {
        $revisionStmt = $pdo->prepare("
            INSERT INTO message_revisions (
                message_id, editor_type, editor_id, action, previous_content, new_content
            ) VALUES (
                :message_id, 'agent', :editor_id, 'edit', :previous_content, :new_content
            )
        ");
        $revisionStmt->execute([
            ':message_id' => $messageId,
            ':editor_id' => $user['id'],
            ':previous_content' => $message['content'],
            ':new_content' => $content,
        ]);

        $updateStmt = $pdo->prepare("
            UPDATE messages
            SET content = :content, edited_at = NOW()
            WHERE id = :message_id
              AND deleted_at IS NULL
        ");
        $updateStmt->execute([':content' => $content, ':message_id' => $messageId]);
    }

    if ($message['message_type'] === 'internal_note') {
        replace_message_mentions($pdo, $messageId, (int) $user['id'], $mentionedUsers);
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Message updated successfully',
        'data' => [
            'id' => $messageId,
            'content' => $content,
            'edited_at' => $content !== trim((string) $message['content'])
                ? date('Y-m-d H:i:s')
                : $message['edited_at'],
            'mentioned_users' => $mentionedUsers,
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = ['success' => false, 'message' => 'Failed to update message'];
    if (!app_is_production()) {
        safe_api_exception_context($e);
    }
    json_response($payload, 500);
}
