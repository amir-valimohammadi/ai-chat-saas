<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/message-send.php
// هدف: ارسال پیام بازدیدکننده از داخل ویجت + کنترل Origin + محدودسازی محتوا

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$input = get_json_input();

$siteKey = trim($input['site_key'] ?? '');
$visitorId = isset($input['visitor_id']) ? (int) $input['visitor_id'] : 0;
$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$content = trim($input['content'] ?? '');

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0 || $content === '') {
    json_response([
        'success' => false,
        'message' => 'site_key, visitor_id, conversation_id and content are required'
    ], 422);
}

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response([
        'success' => false,
        'message' => 'Invalid site_key'
    ], 422);
}

if (mb_strlen($content, 'UTF-8') > 5000) {
    json_response([
        'success' => false,
        'message' => 'Message is too long'
    ], 422);
}

enforce_rate_limit(
    $pdo,
    'widget_message_send',
    rate_limit_identifier($siteKey . '|' . $visitorId . '|' . $conversationId),
    25,
    5 * 60,
    'Too many messages. Please slow down.'
);

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

    if ($conversation['status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'This conversation is closed'
        ], 422);
    }

    $pdo->beginTransaction();

    $messageStmt = $pdo->prepare("
        INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_id,
            content,
            is_read
        ) VALUES (
            :conversation_id,
            'visitor',
            :sender_id,
            :content,
            0
        )
    ");

    $messageStmt->execute([
        ':conversation_id' => $conversationId,
        ':sender_id' => $visitorId,
        ':content' => $content,
    ]);

    $messageId = (int) $pdo->lastInsertId();

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
        'message' => 'Message sent successfully',
        'data' => [
            'id' => $messageId,
            'conversation_id' => $conversationId,
            'sender_type' => 'visitor',
            'sender_id' => $visitorId,
            'content' => $content,
            'created_at' => date('Y-m-d H:i:s'),
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'Failed to send message',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}