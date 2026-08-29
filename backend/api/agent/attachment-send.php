<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/attachment-send.php
// هدف: ارسال امن فایل توسط پشتیبان یا مدیر مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/upload.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$conversationId = isset($_POST['conversation_id']) ? (int) $_POST['conversation_id'] : 0;
$content = trim($_POST['content'] ?? '');
$replyToMessageId = isset($_POST['reply_to_message_id']) ? (int) $_POST['reply_to_message_id'] : 0;
$requestedMessageType = trim($_POST['message_type'] ?? 'file');

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
    ], 422);
}

if ($content !== '' && mb_strlen($content, 'UTF-8') > 5000) {
    json_response([
        'success' => false,
        'message' => 'Message is too long'
    ], 422);
}

if (!isset($_FILES['file'])) {
    json_response([
        'success' => false,
        'message' => 'File is required'
    ], 422);
}

enforce_rate_limit(
    $pdo,
    'agent_attachment_send',
    rate_limit_identifier('user:' . $user['id']),
    20,
    10 * 60,
    'Too many file uploads. Please try again later.'
);

$attachment = null;

try {
    $conversationStmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.status,
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

    require_site_access($pdo, $user, (int) $conversation['site_id']);

    if ($conversation['status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'This conversation is closed'
        ], 422);
    }

    $replyTarget = validate_reply_target_or_fail($pdo, $conversationId, $replyToMessageId);

    if ($replyTarget && $replyTarget['message_type'] === 'internal_note') {
        json_response([
            'success' => false,
            'message' => 'A public attachment cannot reference an internal note',
        ], 422);
    }

    $attachment = save_chat_attachment($_FILES['file'], 'agent');
    $messageType = normalize_message_type($requestedMessageType, $attachment['mime_type']);

    $pdo->beginTransaction();

    $messageContent = $content !== '' ? $content : 'فایل ارسال شد.';

    $messageStmt = $pdo->prepare("
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
            0
        )
    ");

    $messageStmt->execute([
        ':conversation_id' => $conversationId,
        ':message_type' => $messageType,
        ':sender_id' => $user['id'],
        ':reply_to_message_id' => $replyTarget ? (int) $replyTarget['id'] : null,
        ':content' => $messageContent,
    ]);

    $messageId = (int) $pdo->lastInsertId();

    $attachmentStmt = $pdo->prepare("
        INSERT INTO message_attachments (
            message_id,
            original_name,
            stored_name,
            file_path,
            file_url,
            mime_type,
            file_size
        ) VALUES (
            :message_id,
            :original_name,
            :stored_name,
            :file_path,
            :file_url,
            :mime_type,
            :file_size
        )
    ");

    $attachmentStmt->execute([
        ':message_id' => $messageId,
        ':original_name' => $attachment['original_name'],
        ':stored_name' => $attachment['stored_name'],
        ':file_path' => $attachment['file_path'],
        ':file_url' => $attachment['file_url'],
        ':mime_type' => $attachment['mime_type'],
        ':file_size' => $attachment['file_size'],
    ]);

    $updateStmt = $pdo->prepare("
        UPDATE conversations
        SET
            status = CASE
                WHEN status = 'new' THEN 'open'
                ELSE status
            END,
            assigned_agent_id = COALESCE(assigned_agent_id, :agent_id),
            last_message_at = NOW()
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':agent_id' => $user['id'],
        ':id' => $conversationId,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Attachment sent successfully',
        'data' => [
            'id' => $messageId,
            'conversation_id' => $conversationId,
            'sender_type' => 'agent',
            'sender_id' => (int) $user['id'],
            'sender_name' => $user['name'],
            'message_type' => $messageType,
            'reply_to_message_id' => $replyTarget ? (int) $replyTarget['id'] : null,
            'content' => $messageContent,
            'attachment' => public_attachment_payload($attachment),
            'created_at' => date('Y-m-d H:i:s'),
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    if ($attachment && !empty($attachment['file_path']) && file_exists($attachment['file_path'])) {
        @unlink($attachment['file_path']);
    }

    $payload = [
        'success' => false,
        'message' => 'Failed to send attachment',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
