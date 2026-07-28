<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/messages-list.php
// هدف: دریافت پیام‌های یک گفتگو برای ویجت + کنترل Origin + محدودسازی امن polling

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

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
$changedAfterRaw = trim($_GET['changed_after'] ?? '');
$changedAfter = null;
$markRead = isset($_GET['mark_read']) && (string) $_GET['mark_read'] === '1';

if ($changedAfterRaw !== '') {
    $timestamp = strtotime($changedAfterRaw);
    if ($timestamp !== false) {
        $changedAfter = date('Y-m-d H:i:s', $timestamp);
    }
}

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
            conversations.department_id,
            conversations.assigned_agent_id,
            conversations.queue_status,
            conversations.queue_position,
            conversations.queued_at,
            departments.name AS department_name,
            departments.color AS department_color,
            departments.queue_message,
            assigned_agent.name AS assigned_agent_name,
            sites.domain
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        LEFT JOIN departments ON departments.id = conversations.department_id
        LEFT JOIN users AS assigned_agent ON assigned_agent.id = conversations.assigned_agent_id
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
            messages.id,
            messages.conversation_id,
            messages.sender_type,
            messages.message_type,
            messages.sender_id,
            messages.reply_to_message_id,
            messages.content,
            messages.is_read,
            messages.delivered_at,
            messages.read_at,
            messages.edited_at,
            messages.deleted_at,
            messages.interaction_updated_at,
            messages.created_at,
            replied.id AS reply_id,
            replied.sender_type AS reply_sender_type,
            replied.content AS reply_content,
            replied.deleted_at AS reply_deleted_at,
            reply_agent.name AS reply_agent_name
        FROM messages
        LEFT JOIN messages AS replied
            ON replied.id = messages.reply_to_message_id
            AND replied.conversation_id = messages.conversation_id
            AND replied.message_type <> 'internal_note'
        LEFT JOIN users AS reply_agent
            ON reply_agent.id = replied.sender_id
            AND replied.sender_type = 'agent'
        WHERE messages.conversation_id = :conversation_id
          AND messages.message_type <> 'internal_note'
          AND (
              messages.id > :after_id
              OR messages.edited_at >= :changed_after_edited
              OR messages.deleted_at >= :changed_after_deleted
              OR messages.interaction_updated_at >= :changed_after_interaction
          )
        ORDER BY messages.id ASC
        LIMIT 100
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':after_id' => $afterId,
        ':changed_after_edited' => $changedAfter,
        ':changed_after_deleted' => $changedAfter,
        ':changed_after_interaction' => $changedAfter,
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

    $reactionsByMessageId = message_reactions_by_message_ids(
        $pdo,
        $messageIds,
        'visitor',
        $visitorId
    );

    // Every successful poll is a visitor heartbeat. Agent/AI messages are delivered
    // when the widget receives them, and are read only while the chat is visible/open.
    $visitorHeartbeatStmt = $pdo->prepare("
        UPDATE visitors
        SET last_seen_at = NOW()
        WHERE id = :visitor_id AND site_id = :site_id
    ");
    $visitorHeartbeatStmt->execute([
        ':visitor_id' => $visitorId,
        ':site_id' => (int) $conversation['site_id'],
    ]);

    mark_conversation_messages_received(
        $pdo,
        $conversationId,
        ['agent', 'ai', 'system'],
        $markRead
    );

    // Reflect the receipt update in the current response without another query.
    $receiptNow = date('Y-m-d H:i:s');
    foreach ($messages as &$messageRow) {
        if (in_array($messageRow['sender_type'], ['agent', 'ai', 'system'], true)) {
            $messageRow['delivered_at'] = $messageRow['delivered_at'] ?: $receiptNow;
            if ($markRead) {
                $messageRow['read_at'] = $messageRow['read_at'] ?: $receiptNow;
                $messageRow['is_read'] = 1;
            }
        }
    }
    unset($messageRow);

    json_response([
        'success' => true,
        'server_time' => date('Y-m-d H:i:s'),
        'conversation' => [
            'id' => (int) $conversation['id'],
            'status' => $conversation['status'],
            'queue_status' => $conversation['queue_status'],
            'queue_position' => $conversation['queue_position'] !== null ? (int) $conversation['queue_position'] : null,
            'queue_message' => $conversation['queue_message'],
            'department' => $conversation['department_id'] !== null ? [
                'id' => (int) $conversation['department_id'],
                'name' => $conversation['department_name'],
                'color' => $conversation['department_color'],
            ] : null,
            'assigned_agent' => $conversation['assigned_agent_id'] !== null ? [
                'id' => (int) $conversation['assigned_agent_id'],
                'name' => $conversation['assigned_agent_name'],
            ] : null,
        ],
        'messages' => array_map(function ($message) use ($attachmentsByMessageId, $reactionsByMessageId, $visitorId) {
            $messageId = (int) $message['id'];
            $isDeleted = $message['deleted_at'] !== null;
            $canModify = message_can_be_modified_by($message, 'visitor', $visitorId);

            return [
                'id' => $messageId,
                'conversation_id' => (int) $message['conversation_id'],
                'sender_type' => $message['sender_type'],
                'message_type' => $message['message_type'],
                'sender_id' => $message['sender_id'] !== null ? (int) $message['sender_id'] : null,
                'reply_to_message_id' => $message['reply_to_message_id'] !== null ? (int) $message['reply_to_message_id'] : null,
                'reply_to' => $message['reply_id'] !== null ? message_reply_snapshot($message) : null,
                'content' => $isDeleted ? 'این پیام حذف شده است.' : $message['content'],
                'is_read' => $message['read_at'] !== null || (bool) $message['is_read'],
                'delivered_at' => $message['delivered_at'],
                'read_at' => $message['read_at'],
                'delivery_status' => message_delivery_status($message['delivered_at'], $message['read_at']),
                'is_edited' => $message['edited_at'] !== null,
                'edited_at' => $message['edited_at'],
                'is_deleted' => $isDeleted,
                'deleted_at' => $message['deleted_at'],
                'can_edit' => $canModify,
                'can_delete' => $canModify,
                'attachments' => $isDeleted ? [] : ($attachmentsByMessageId[$messageId] ?? []),
                'reactions' => $isDeleted ? [] : ($reactionsByMessageId[$messageId] ?? []),
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