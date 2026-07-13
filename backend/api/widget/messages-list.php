<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/messages-list.php
// هدف: دریافت پیام‌های یک گفتگو برای ویجت + کنترل Origin + محدودسازی امن polling

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$siteKey = trim($_GET['site_key'] ?? '');
$visitorId = isset($_GET['visitor_id']) ? (int) $_GET['visitor_id'] : 0;
$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;
$afterId = isset($_GET['after_id']) ? (int) $_GET['after_id'] : 0;

$afterId = max(0, $afterId);

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_key, visitor_id and conversation_id are required'
    ], 422);
}

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response([
        'success' => false,
        'message' => 'Invalid site_key'
    ], 422);
}

// در production این endpoint مخصوص مرورگر و ویجت است.
// درخواست مستقیم بدون Origin را برای کاهش سوءاستفاده رد می‌کنیم.
if (app_is_production() && empty($_SERVER['HTTP_ORIGIN'])) {
    json_response([
        'success' => false,
        'message' => 'Origin is required'
    ], 403);
}

// محافظ کلی برای جلوگیری از فشار زیاد روی endpoint حتی قبل از lookup دیتابیس.
// این محدودیت per-IP است و نباید جایگزین محدودیت conversation-level شود.
enforce_rate_limit(
    $pdo,
    'widget_messages_list_ip_guard',
    rate_limit_identifier($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    300,
    60,
    'Too many refresh requests. Please slow down.'
);

try {
    $conversationStmt = $pdo->prepare("
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

    $conversationStmt->execute([
        ':conversation_id' => $conversationId,
        ':visitor_id' => $visitorId,
        ':site_key' => $siteKey,
    ]);

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    validate_widget_origin_or_fail($conversation['domain']);

    // محدودیت اصلی مخصوص همین گفتگو.
    // polling ویجت هر ۲.۵ ثانیه حدوداً ۲۴ درخواست در دقیقه است؛ ۹۰ عدد حاشیه امن دارد.
    enforce_rate_limit(
        $pdo,
        'widget_messages_list',
        rate_limit_identifier($siteKey . '|' . $visitorId . '|' . $conversationId),
        90,
        60,
        'Too many refresh requests. Please slow down.'
    );

    $stmt = $pdo->prepare("
        SELECT
            id,
            conversation_id,
            sender_type,
            sender_id,
            content,
            is_read,
            created_at
        FROM messages
        WHERE conversation_id = :conversation_id
          AND id > :after_id
        ORDER BY id ASC
        LIMIT 100
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':after_id' => $afterId,
    ]);

    $messages = $stmt->fetchAll();

    $messageIds = array_map(function ($message) {
        return (int) $message['id'];
    }, $messages);

    $attachmentsByMessageId = [];

    if (count($messageIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));

        $attachmentsStmt = $pdo->prepare("
            SELECT
                id,
                message_id,
                original_name,
                file_url,
                mime_type,
                file_size,
                created_at
            FROM message_attachments
            WHERE message_id IN ($placeholders)
            ORDER BY id ASC
        ");

        $attachmentsStmt->execute($messageIds);

        foreach ($attachmentsStmt->fetchAll() as $attachment) {
            $messageId = (int) $attachment['message_id'];

            if (!isset($attachmentsByMessageId[$messageId])) {
                $attachmentsByMessageId[$messageId] = [];
            }

            $attachmentsByMessageId[$messageId][] = [
                'id' => (int) $attachment['id'],
                'message_id' => $messageId,
                'original_name' => $attachment['original_name'],
                'file_url' => $attachment['file_url'],
                'mime_type' => $attachment['mime_type'],
                'file_size' => (int) $attachment['file_size'],
                'created_at' => $attachment['created_at'],
            ];
        }
    }

    json_response([
        'success' => true,
        'messages' => array_map(function ($message) use ($attachmentsByMessageId) {
            $messageId = (int) $message['id'];

            return [
                'id' => $messageId,
                'conversation_id' => (int) $message['conversation_id'],
                'sender_type' => $message['sender_type'],
                'sender_id' => $message['sender_id'] !== null ? (int) $message['sender_id'] : null,
                'content' => $message['content'],
                'is_read' => (bool) $message['is_read'],
                'attachments' => $attachmentsByMessageId[$messageId] ?? [],
                'created_at' => $message['created_at'],
            ];
        }, $messages),
    ]);
} catch (Exception $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to load messages',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}