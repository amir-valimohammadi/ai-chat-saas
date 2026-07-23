<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/conversations-list.php
// هدف: دریافت امن لیست گفتگوهای قابل دسترسی برای پشتیبان یا مدیر مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$status = trim($_GET['status'] ?? '');

$allowedStatuses = [
    'new',
    'open',
    'in_progress',
    'waiting_customer',
    'follow_up',
    'pending',
    'closed',
];

$statusSql = '';
$params = [];

if ($status !== '' && in_array($status, $allowedStatuses, true)) {
    $statusSql = " AND conversations.status = :status ";
    $params[':status'] = $status;
}

$params[':mention_user_id'] = (int) $user['id'];

try {
    if ($user['role'] === 'customer_admin') {
        $sql = "
            SELECT
                conversations.id,
                conversations.status,
                conversations.source_page_url,
                conversations.source_page_title,
                conversations.last_message_at,
                conversations.created_at,

                sites.id AS site_id,
                sites.name AS site_name,

                visitors.id AS visitor_id,
                visitors.name AS visitor_name,
                visitors.email AS visitor_email,
                visitors.phone AS visitor_phone,
                visitors.last_seen_at AS visitor_last_seen_at,

                assigned_agent.id AS assigned_agent_id,
                assigned_agent.name AS assigned_agent_name,
                assigned_agent.email AS assigned_agent_email,

                (
                    SELECT content
                    FROM messages
                    WHERE messages.conversation_id = conversations.id
                      AND messages.message_type <> 'internal_note'
                    ORDER BY messages.id DESC
                    LIMIT 1
                ) AS last_message,

                (
                    SELECT COUNT(*)
                    FROM messages
                    WHERE messages.conversation_id = conversations.id
                      AND messages.sender_type = 'visitor'
                      AND messages.read_at IS NULL
                ) AS unread_count,

                (
                    SELECT COUNT(*)
                    FROM message_mentions
                    INNER JOIN messages AS mention_messages
                        ON mention_messages.id = message_mentions.message_id
                    WHERE mention_messages.conversation_id = conversations.id
                      AND mention_messages.message_type = 'internal_note'
                      AND mention_messages.deleted_at IS NULL
                      AND message_mentions.mentioned_user_id = :mention_user_id
                      AND message_mentions.read_at IS NULL
                ) AS unread_mention_count
            FROM conversations
            INNER JOIN sites ON sites.id = conversations.site_id
            INNER JOIN visitors ON visitors.id = conversations.visitor_id
            LEFT JOIN users AS assigned_agent
                ON assigned_agent.id = conversations.assigned_agent_id
                AND assigned_agent.tenant_id = sites.tenant_id
            WHERE sites.tenant_id = :tenant_id
            {$statusSql}
            ORDER BY conversations.last_message_at DESC, conversations.id DESC
            LIMIT 100
        ";

        $params[':tenant_id'] = $user['tenant_id'];
    } else {
        $sql = "
            SELECT
                conversations.id,
                conversations.status,
                conversations.source_page_url,
                conversations.source_page_title,
                conversations.last_message_at,
                conversations.created_at,

                sites.id AS site_id,
                sites.name AS site_name,

                visitors.id AS visitor_id,
                visitors.name AS visitor_name,
                visitors.email AS visitor_email,
                visitors.phone AS visitor_phone,
                visitors.last_seen_at AS visitor_last_seen_at,

                assigned_agent.id AS assigned_agent_id,
                assigned_agent.name AS assigned_agent_name,
                assigned_agent.email AS assigned_agent_email,

                (
                    SELECT content
                    FROM messages
                    WHERE messages.conversation_id = conversations.id
                      AND messages.message_type <> 'internal_note'
                    ORDER BY messages.id DESC
                    LIMIT 1
                ) AS last_message,

                (
                    SELECT COUNT(*)
                    FROM messages
                    WHERE messages.conversation_id = conversations.id
                      AND messages.sender_type = 'visitor'
                      AND messages.read_at IS NULL
                ) AS unread_count,

                (
                    SELECT COUNT(*)
                    FROM message_mentions
                    INNER JOIN messages AS mention_messages
                        ON mention_messages.id = message_mentions.message_id
                    WHERE mention_messages.conversation_id = conversations.id
                      AND mention_messages.message_type = 'internal_note'
                      AND mention_messages.deleted_at IS NULL
                      AND message_mentions.mentioned_user_id = :mention_user_id
                      AND message_mentions.read_at IS NULL
                ) AS unread_mention_count
            FROM conversations
            INNER JOIN sites ON sites.id = conversations.site_id
            INNER JOIN visitors ON visitors.id = conversations.visitor_id
            LEFT JOIN users AS assigned_agent
                ON assigned_agent.id = conversations.assigned_agent_id
                AND assigned_agent.tenant_id = sites.tenant_id
            INNER JOIN agent_site_access ON agent_site_access.site_id = sites.id
            WHERE sites.tenant_id = :tenant_id
              AND agent_site_access.user_id = :user_id
            {$statusSql}
            ORDER BY conversations.last_message_at DESC, conversations.id DESC
            LIMIT 100
        ";

        $params[':tenant_id'] = $user['tenant_id'];
        $params[':user_id'] = $user['id'];
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $conversations = $stmt->fetchAll();

    json_response([
        'success' => true,
        'conversations' => array_map(function ($conversation) {
            return [
                'id' => (int) $conversation['id'],
                'status' => $conversation['status'],
                'site' => [
                    'id' => (int) $conversation['site_id'],
                    'name' => $conversation['site_name'],
                ],
                'visitor' => [
                    'id' => (int) $conversation['visitor_id'],
                    'name' => $conversation['visitor_name'],
                    'email' => $conversation['visitor_email'],
                    'phone' => $conversation['visitor_phone'],
                    'last_seen_at' => $conversation['visitor_last_seen_at'],
                    'is_online' => visitor_is_recently_online($conversation['visitor_last_seen_at']),
                ],
                'assigned_agent' => $conversation['assigned_agent_id'] !== null ? [
                    'id' => (int) $conversation['assigned_agent_id'],
                    'name' => $conversation['assigned_agent_name'],
                    'email' => $conversation['assigned_agent_email'],
                ] : null,
                'source_page_url' => $conversation['source_page_url'],
                'source_page_title' => $conversation['source_page_title'],
                'last_message' => $conversation['last_message'],
                'last_message_at' => $conversation['last_message_at'],
                'created_at' => $conversation['created_at'],
                'unread_count' => (int) ($conversation['unread_count'] ?? 0),
                'has_unread' => ((int) ($conversation['unread_count'] ?? 0)) > 0,
                'unread_mention_count' => (int) ($conversation['unread_mention_count'] ?? 0),
                'has_unread_mention' => ((int) ($conversation['unread_mention_count'] ?? 0)) > 0,
            ];
        }, $conversations)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load conversations',
        'error' => $e->getMessage()
    ], 500);
}