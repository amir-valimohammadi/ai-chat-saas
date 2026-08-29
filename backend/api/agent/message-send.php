<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/message-send.php
// هدف: ارسال امن پاسخ پشتیبان به یک گفتگو

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$input = get_json_input();

$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$content = trim($input['content'] ?? '');
$replyToMessageId = isset($input['reply_to_message_id']) ? (int) $input['reply_to_message_id'] : 0;
$requestedMessageType = trim((string) ($input['message_type'] ?? 'text'));
$messageType = $requestedMessageType === 'internal_note' ? 'internal_note' : 'text';
$mentionedUserIds = normalize_mentioned_user_ids($input['mentioned_user_ids'] ?? []);

if ($conversationId <= 0 || $content === '') {
    json_response([
        'success' => false,
        'message' => 'conversation_id and content are required'
    ], 422);
}

if (mb_strlen($content, 'UTF-8') > 5000) {
    json_response([
        'success' => false,
        'message' => 'Message is too long'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.status,
            conversations.assigned_agent_id,
            sites.tenant_id AS site_tenant_id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE conversations.id = :id
          AND sites.is_active = 1
          AND tenants.status = 'active'
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':id' => $conversationId
    ]);

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    // جلوگیری از IDOR:
    // حتی اگر کاربر conversation_id را دستی عوض کند، باید به site مربوطه دسترسی داشته باشد.
    require_site_access($pdo, $user, (int) $conversation['site_id']);

    if ($conversation['status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'This conversation is closed'
        ], 422);
    }

    $replyTarget = validate_reply_target_or_fail($pdo, $conversationId, $replyToMessageId);

    if ($messageType !== 'internal_note' && $replyTarget && $replyTarget['message_type'] === 'internal_note') {
        json_response([
            'success' => false,
            'message' => 'A public reply cannot reference an internal note',
        ], 422);
    }

    $mentionedUsers = $messageType === 'internal_note'
        ? validate_mentioned_users_or_fail(
            $pdo,
            $mentionedUserIds,
            (int) $conversation['site_tenant_id'],
            (int) $conversation['site_id']
        )
        : [];

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO messages (
            conversation_id,
            sender_type,
            message_type,
            sender_id,
            reply_to_message_id,
            content,
            is_read
        ) VALUES (
            :conversation_id,
            'agent',
            :message_type,
            :sender_id,
            :reply_to_message_id,
            :content,
            :is_read
        )
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':message_type' => $messageType,
        ':sender_id' => $user['id'],
        ':reply_to_message_id' => $replyTarget ? (int) $replyTarget['id'] : null,
        ':content' => $content,
        ':is_read' => $messageType === 'internal_note' ? 1 : 0,
    ]);

    $messageId = (int) $pdo->lastInsertId();

    if ($messageType === 'internal_note') {
        replace_message_mentions($pdo, $messageId, (int) $user['id'], $mentionedUsers);
    }

    $updateStmt = $pdo->prepare("
        UPDATE conversations
        SET
            status = CASE
                WHEN :is_internal_note = 0 AND status = 'new' THEN 'open'
                ELSE status
            END,
            assigned_agent_id = COALESCE(assigned_agent_id, :agent_id),
            last_message_at = CASE
                WHEN :is_internal_note_last = 0 THEN NOW()
                ELSE last_message_at
            END
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':is_internal_note' => $messageType === 'internal_note' ? 1 : 0,
        ':is_internal_note_last' => $messageType === 'internal_note' ? 1 : 0,
        ':agent_id' => $user['id'],
        ':id' => $conversationId,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Reply sent successfully',
        'data' => [
            'id' => $messageId,
            'conversation_id' => $conversationId,
            'sender_type' => 'agent',
            'sender_id' => (int) $user['id'],
            'sender_name' => $user['name'],
            'message_type' => $messageType,
            'reply_to_message_id' => $replyTarget ? (int) $replyTarget['id'] : null,
            'content' => $content,
            'mentioned_users' => $mentionedUsers,
            'created_at' => date('Y-m-d H:i:s'),
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to send reply',
        ...safe_api_exception_context($e)
    ], 500);
}