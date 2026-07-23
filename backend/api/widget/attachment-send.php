<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/attachment-send.php
// هدف: ارسال امن فایل توسط بازدیدکننده از ویجت + کنترل Origin

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/upload.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/message-helpers.php';
require_once __DIR__ . '/../../includes/hosted-support.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$siteKey = trim($_POST['site_key'] ?? '');
$visitorId = isset($_POST['visitor_id']) ? (int) $_POST['visitor_id'] : 0;
$conversationId = isset($_POST['conversation_id']) ? (int) $_POST['conversation_id'] : 0;
$content = trim($_POST['content'] ?? '');
$replyToMessageId = isset($_POST['reply_to_message_id']) ? (int) $_POST['reply_to_message_id'] : 0;
$requestedMessageType = trim($_POST['message_type'] ?? 'file');

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_key, visitor_id and conversation_id are required'
    ], 422);
}

if ($content !== '' && mb_strlen($content, 'UTF-8') > 2000) {
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
    'widget_attachment_send',
    rate_limit_identifier(
        $siteKey . '|' .
        $visitorId . '|' .
        $conversationId . '|' .
        ($_SERVER['REMOTE_ADDR'] ?? 'unknown')
    ),
    8,
    10 * 60,
    'Too many file uploads. Please try again later.'
);

$attachment = null;

try {
    $stmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.visitor_id,
            conversations.status,
            sites.domain
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

    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':visitor_id' => $visitorId,
        ':site_key' => $siteKey
    ]);

    $conversation = $stmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    validate_widget_origin_or_fail($conversation['domain']);

    $siteId = (int) $conversation['site_id'];
    $supportStatus = hosted_support_compute_status(
        $pdo,
        $siteId,
        hosted_support_site_timezone($pdo, $siteId)
    );

    if (!$supportStatus['chat_available']) {
        json_response([
            'success' => false,
            'message' => $supportStatus['offline']['offline_message']
                ?: 'پشتیبانی در حال حاضر امکان دریافت فایل جدید را ندارد.',
            'code' => 'support_closed',
            'next_opening' => $supportStatus['next_opening'],
        ], 403);
    }

    if ($conversation['status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'This conversation is closed'
        ], 422);
    }

    $replyTarget = validate_reply_target_or_fail($pdo, $conversationId, $replyToMessageId, 'visitor');

    $attachment = save_chat_attachment($_FILES['file'], 'widget');
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
            'visitor',
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
        ':sender_id' => $visitorId,
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
            last_message_at = NOW()
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':id' => $conversationId
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Attachment sent successfully',
        'data' => [
            'id' => $messageId,
            'conversation_id' => $conversationId,
            'sender_type' => 'visitor',
            'sender_id' => $visitorId,
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
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}