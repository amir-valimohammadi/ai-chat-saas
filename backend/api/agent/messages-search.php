<?php

// Search messages globally or inside one accessible conversation.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$query = trim((string) ($_GET['q'] ?? ''));
$conversationId = isset($_GET['conversation_id']) ? max(0, (int) $_GET['conversation_id']) : 0;
$senderType = trim((string) ($_GET['sender_type'] ?? ''));
$messageType = trim((string) ($_GET['message_type'] ?? ''));
$limit = isset($_GET['limit']) ? max(1, min(100, (int) $_GET['limit'])) : 50;

if ($query === '' || (function_exists('mb_strlen') ? mb_strlen($query, 'UTF-8') : strlen($query)) < 2) {
    json_response(['success' => false, 'message' => 'Search query must contain at least 2 characters'], 422);
}

$allowedSenders = ['', 'visitor', 'agent', 'ai', 'system'];
$allowedMessageTypes = ['', 'text', 'file', 'voice', 'system', 'internal_note'];
if (!in_array($senderType, $allowedSenders, true) || !in_array($messageType, $allowedMessageTypes, true)) {
    json_response(['success' => false, 'message' => 'Invalid search filter'], 422);
}

try {
    if ($conversationId > 0) {
        $conversationStmt = $pdo->prepare("
            SELECT conversations.id, conversations.site_id
            FROM conversations
            INNER JOIN sites ON sites.id = conversations.site_id
            WHERE conversations.id = :conversation_id
              AND sites.tenant_id = :tenant_id
            LIMIT 1
        ");
        $conversationStmt->execute([
            ':conversation_id' => $conversationId,
            ':tenant_id' => (int) $user['tenant_id'],
        ]);
        $conversation = $conversationStmt->fetch();
        if (!$conversation) {
            json_response(['success' => false, 'message' => 'Conversation not found'], 404);
        }
        require_site_access($pdo, $user, (int) $conversation['site_id']);
    }

    $conditions = [
        'sites.tenant_id = :tenant_id',
        'messages.deleted_at IS NULL',
        '(messages.content LIKE :query OR EXISTS (
            SELECT 1 FROM message_attachments search_attachments
            WHERE search_attachments.message_id = messages.id
              AND search_attachments.original_name LIKE :attachment_query
        ))',
    ];
    $params = [
        ':tenant_id' => (int) $user['tenant_id'],
        ':query' => '%' . $query . '%',
        ':attachment_query' => '%' . $query . '%',
    ];

    if ($user['role'] === 'agent') {
        $conditions[] = 'EXISTS (
            SELECT 1 FROM agent_site_access
            WHERE agent_site_access.site_id = conversations.site_id
              AND agent_site_access.user_id = :user_id
        )';
        $params[':user_id'] = (int) $user['id'];
    }

    if ($conversationId > 0) {
        $conditions[] = 'messages.conversation_id = :conversation_id';
        $params[':conversation_id'] = $conversationId;
    }

    if ($senderType !== '') {
        $conditions[] = 'messages.sender_type = :sender_type';
        $params[':sender_type'] = $senderType;
    }

    if ($messageType !== '') {
        $conditions[] = 'messages.message_type = :message_type';
        $params[':message_type'] = $messageType;
    }

    $sql = "
        SELECT
            messages.id,
            messages.conversation_id,
            messages.sender_type,
            messages.sender_id,
            messages.message_type,
            messages.content,
            messages.edited_at,
            messages.created_at,
            conversations.status AS conversation_status,
            conversations.priority,
            conversations.is_archived,
            visitors.name AS visitor_name,
            visitors.email AS visitor_email,
            visitors.phone AS visitor_phone,
            sites.id AS site_id,
            sites.name AS site_name,
            users.name AS agent_name,
            (
                SELECT COUNT(*)
                FROM message_attachments
                WHERE message_attachments.message_id = messages.id
            ) AS attachment_count
        FROM messages
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN users ON users.id = messages.sender_id AND messages.sender_type = 'agent'
        WHERE " . implode(' AND ', $conditions) . "
        ORDER BY messages.id DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $results = array_map(static function ($row) use ($query) {
        $content = trim((string) $row['content']);
        $snippet = $content;
        $maxLength = 240;
        if (function_exists('mb_strlen') && mb_strlen($snippet, 'UTF-8') > $maxLength) {
            $snippet = mb_substr($snippet, 0, $maxLength, 'UTF-8') . '…';
        } elseif (strlen($snippet) > $maxLength) {
            $snippet = substr($snippet, 0, $maxLength) . '…';
        }

        return [
            'id' => (int) $row['id'],
            'conversation_id' => (int) $row['conversation_id'],
            'sender_type' => $row['sender_type'],
            'sender_id' => $row['sender_id'] !== null ? (int) $row['sender_id'] : null,
            'sender_name' => $row['sender_type'] === 'agent'
                ? ($row['agent_name'] ?: 'پشتیبان')
                : ($row['sender_type'] === 'visitor' ? ($row['visitor_name'] ?: 'کاربر') : 'سیستم'),
            'message_type' => $row['message_type'],
            'content' => $content,
            'snippet' => $snippet,
            'is_edited' => $row['edited_at'] !== null,
            'created_at' => $row['created_at'],
            'attachment_count' => (int) $row['attachment_count'],
            'conversation' => [
                'status' => $row['conversation_status'],
                'priority' => $row['priority'],
                'is_archived' => (bool) $row['is_archived'],
            ],
            'visitor' => [
                'name' => $row['visitor_name'],
                'email' => $row['visitor_email'],
                'phone' => $row['visitor_phone'],
            ],
            'site' => [
                'id' => (int) $row['site_id'],
                'name' => $row['site_name'],
            ],
            'query' => $query,
        ];
    }, $stmt->fetchAll());

    json_response([
        'success' => true,
        'query' => $query,
        'count' => count($results),
        'results' => $results,
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Message search failed',
        'error' => $e->getMessage(),
    ], 500);
}
