<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/conversation-show.php
// هدف: نمایش امن جزئیات یک گفتگو برای پشتیبان یا مدیر مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.visitor_id,
            conversations.assigned_agent_id,
            conversations.status,
            conversations.source_page_url,
            conversations.source_page_title,
            conversations.ai_summary,
            conversations.ai_category,
            conversations.last_message_at,
            conversations.created_at,
            conversations.closed_at,

            sites.name AS site_name,
            sites.domain AS site_domain,
            sites.tenant_id AS site_tenant_id,

            visitors.name AS visitor_name,
            visitors.email AS visitor_email,
            visitors.phone AS visitor_phone,
            visitors.browser_id AS visitor_browser_id,
            visitors.ip_address AS visitor_ip_address,

            assigned_agent.name AS assigned_agent_name,
            assigned_agent.email AS assigned_agent_email
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN users AS assigned_agent
            ON assigned_agent.id = conversations.assigned_agent_id
            AND assigned_agent.tenant_id = sites.tenant_id
        WHERE conversations.id = :conversation_id
        LIMIT 1
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId
    ]);

    $conversation = $stmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    // جلوگیری از IDOR:
    // بعد از پیدا شدن گفتگو، دسترسی کاربر به site همان گفتگو بررسی می‌شود.
    require_site_access($pdo, $user, (int) $conversation['site_id']);

    $messagesStmt = $pdo->prepare("
        SELECT
            messages.id,
            messages.conversation_id,
            messages.sender_type,
            messages.sender_id,
            messages.content,
            messages.is_read,
            messages.created_at,
            users.name AS agent_name
        FROM messages
        LEFT JOIN users 
            ON users.id = messages.sender_id
            AND messages.sender_type = 'agent'
        WHERE messages.conversation_id = :conversation_id
        ORDER BY messages.id ASC
    ");

    $messagesStmt->execute([
        ':conversation_id' => $conversationId
    ]);

    $messages = $messagesStmt->fetchAll();

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

    // فقط بعد از تایید دسترسی، پیام‌های visitor را خوانده‌شده می‌کنیم.
    $markReadStmt = $pdo->prepare("
        UPDATE messages
        SET is_read = 1
        WHERE conversation_id = :conversation_id
          AND sender_type = 'visitor'
          AND is_read = 0
    ");

    $markReadStmt->execute([
        ':conversation_id' => $conversationId
    ]);

    json_response([
        'success' => true,
        'conversation' => [
            'id' => (int) $conversation['id'],
            'status' => $conversation['status'],
            'assigned_agent' => $conversation['assigned_agent_id'] !== null ? [
                'id' => (int) $conversation['assigned_agent_id'],
                'name' => $conversation['assigned_agent_name'],
                'email' => $conversation['assigned_agent_email'],
            ] : null,
            'source_page_url' => $conversation['source_page_url'],
            'source_page_title' => $conversation['source_page_title'],
            'ai_summary' => $conversation['ai_summary'],
            'ai_category' => $conversation['ai_category'],
            'last_message_at' => $conversation['last_message_at'],
            'created_at' => $conversation['created_at'],
            'closed_at' => $conversation['closed_at'],
            'site' => [
                'id' => (int) $conversation['site_id'],
                'name' => $conversation['site_name'],
                'domain' => $conversation['site_domain'],
            ],
            'visitor' => [
                'id' => (int) $conversation['visitor_id'],
                'name' => $conversation['visitor_name'],
                'email' => $conversation['visitor_email'],
                'phone' => $conversation['visitor_phone'],
                'browser_id' => $conversation['visitor_browser_id'],
                'ip_address' => $conversation['visitor_ip_address'],
            ],
            'messages' => array_map(function ($message) use ($attachmentsByMessageId) {
                $messageId = (int) $message['id'];

                return [
                    'id' => $messageId,
                    'conversation_id' => (int) $message['conversation_id'],
                    'sender_type' => $message['sender_type'],
                    'sender_id' => $message['sender_id'] !== null ? (int) $message['sender_id'] : null,
                    'sender_name' => $message['sender_type'] === 'agent' ? $message['agent_name'] : null,
                    'content' => $message['content'],
                    'is_read' => (bool) $message['is_read'],
                    'attachments' => $attachmentsByMessageId[$messageId] ?? [],
                    'created_at' => $message['created_at'],
                ];
            }, $messages)
        ]
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load conversation',
        'error' => $e->getMessage()
    ], 500);
}