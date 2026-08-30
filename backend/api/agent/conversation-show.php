<?php

// Conversation details with replies, reactions, mentions, read receipts and optional history pagination.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/message-helpers.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;
$beforeId = isset($_GET['before_id']) ? max(0, (int) $_GET['before_id']) : 0;
$aroundId = isset($_GET['around_id']) ? max(0, (int) $_GET['around_id']) : 0;
$markRead = !isset($_GET['mark_read']) || (string) $_GET['mark_read'] === '1';
$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 100;
$limit = max(20, min(100, $limit));

if ($conversationId <= 0) {
    json_response(['success' => false, 'message' => 'conversation_id is required'], 422);
}

try {
    $stmt = $pdo->prepare("\n        SELECT\n            conversations.id, conversations.site_id, conversations.visitor_id,\n            conversations.assigned_agent_id, conversations.department_id, conversations.status,
            conversations.queue_status, conversations.queue_position, conversations.queued_at,
            conversations.assigned_at, conversations.assignment_method,\n            conversations.priority, conversations.is_pinned, conversations.pinned_at,\n            conversations.is_archived, conversations.archived_at,\n            conversations.source_page_url, conversations.source_page_title,\n            conversations.ai_summary, conversations.ai_category,\n            conversations.last_message_at, conversations.created_at, conversations.closed_at,\n            sites.name AS site_name, sites.domain AS site_domain, sites.tenant_id AS site_tenant_id,\n            departments.name AS department_name, departments.color AS department_color,\n            departments.routing_strategy AS routing_strategy, departments.queue_message AS queue_message,\n            visitors.name AS visitor_name, visitors.email AS visitor_email,\n            visitors.phone AS visitor_phone, visitors.browser_id AS visitor_browser_id,\n            visitors.ip_address AS visitor_ip_address, visitors.user_agent AS visitor_user_agent,\n            visitors.last_seen_at AS visitor_last_seen_at,\n            assigned_agent.name AS assigned_agent_name, assigned_agent.email AS assigned_agent_email\n        FROM conversations\n        INNER JOIN sites ON sites.id = conversations.site_id\n        INNER JOIN visitors ON visitors.id = conversations.visitor_id\n        LEFT JOIN departments\n            ON departments.id = conversations.department_id\n            AND departments.site_id = conversations.site_id\n            AND departments.tenant_id = sites.tenant_id\n        LEFT JOIN users AS assigned_agent\n            ON assigned_agent.id = conversations.assigned_agent_id\n            AND assigned_agent.tenant_id = sites.tenant_id\n        WHERE conversations.id = :conversation_id\n        LIMIT 1\n    ");
    $stmt->execute([':conversation_id' => $conversationId]);
    $conversation = $stmt->fetch();

    if (!$conversation) {
        json_response(['success' => false, 'message' => 'Conversation not found'], 404);
    }

    require_site_access($pdo, $user, (int) $conversation['site_id']);

    $beforeSql = $beforeId > 0 ? ' AND messages.id < :before_id ' : '';
    if ($aroundId > 0) {
        $beforeSql = ' AND messages.id BETWEEN :around_min AND :around_max ';
    }
    $messageOrder = $aroundId > 0 ? 'ASC' : 'DESC';
    $messagesSql = "\n        SELECT\n            messages.id, messages.conversation_id, messages.sender_type,\n            messages.message_type, messages.sender_id, messages.reply_to_message_id,\n            messages.content, messages.is_read, messages.delivered_at, messages.read_at,\n            messages.edited_at, messages.deleted_at, messages.interaction_updated_at,\n            messages.created_at, users.name AS agent_name,\n            replied.id AS reply_id, replied.sender_type AS reply_sender_type,\n            replied.content AS reply_content, replied.deleted_at AS reply_deleted_at,\n            reply_agent.name AS reply_agent_name\n        FROM messages\n        LEFT JOIN users\n            ON users.id = messages.sender_id AND messages.sender_type = 'agent'\n        LEFT JOIN messages AS replied\n            ON replied.id = messages.reply_to_message_id\n            AND replied.conversation_id = messages.conversation_id\n        LEFT JOIN users AS reply_agent\n            ON reply_agent.id = replied.sender_id AND replied.sender_type = 'agent'\n        WHERE messages.conversation_id = :conversation_id\n        {$beforeSql}\n        ORDER BY messages.id {$messageOrder}\n        LIMIT {$limit}\n    ";

    $messagesStmt = $pdo->prepare($messagesSql);
    $messageParams = [':conversation_id' => $conversationId];
    if ($aroundId > 0) {
        $messageParams[':around_min'] = max(1, $aroundId - 60);
        $messageParams[':around_max'] = $aroundId + 60;
    } elseif ($beforeId > 0) {
        $messageParams[':before_id'] = $beforeId;
    }
    $messagesStmt->execute($messageParams);
    $messages = $messagesStmt->fetchAll();
    if ($aroundId === 0) {
        $messages = array_reverse($messages);
    }

    $messageIds = array_map(static fn ($message) => (int) $message['id'], $messages);
    $attachmentsByMessageId = [];

    if ($messageIds) {
        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));
        $attachmentsStmt = $pdo->prepare("\n            SELECT id, message_id, original_name, file_url, mime_type, file_size, created_at\n            FROM message_attachments\n            WHERE message_id IN ($placeholders)\n            ORDER BY id ASC\n        ");
        $attachmentsStmt->execute($messageIds);

        foreach ($attachmentsStmt->fetchAll() as $attachment) {
            $messageId = (int) $attachment['message_id'];
            $attachmentsByMessageId[$messageId] ??= [];
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

    $reactionsByMessageId = message_reactions_by_message_ids($pdo, $messageIds, 'agent', (int) $user['id']);
    $mentionsByMessageId = message_mentions_by_message_ids($pdo, $messageIds);

    $firstUnreadMessageId = null;

    if ($beforeId === 0 && $aroundId === 0) {
        $unreadIds = mark_conversation_messages_received($pdo, $conversationId, ['visitor'], $markRead);
        $visibleUnreadIds = array_values(array_intersect($unreadIds, $messageIds));
        $firstUnreadMessageId = $visibleUnreadIds[0] ?? null;

        if ($markRead) {
            $markMentionsReadStmt = $pdo->prepare("\n            UPDATE message_mentions\n            INNER JOIN messages ON messages.id = message_mentions.message_id\n            SET message_mentions.read_at = NOW()\n            WHERE messages.conversation_id = :conversation_id\n              AND message_mentions.mentioned_user_id = :mentioned_user_id\n              AND message_mentions.read_at IS NULL\n        ");
            $markMentionsReadStmt->execute([
                ':conversation_id' => $conversationId,
                ':mentioned_user_id' => (int) $user['id'],
            ]);
        }
    }

    $oldestMessageId = $messageIds ? min($messageIds) : null;
    $hasMore = false;

    if ($oldestMessageId !== null && $aroundId === 0) {
        $hasMoreStmt = $pdo->prepare("\n            SELECT 1\n            FROM messages\n            WHERE conversation_id = :conversation_id\n              AND id < :oldest_id\n            LIMIT 1\n        ");
        $hasMoreStmt->execute([
            ':conversation_id' => $conversationId,
            ':oldest_id' => $oldestMessageId,
        ]);
        $hasMore = (bool) $hasMoreStmt->fetchColumn();
    }

    $presentedMessages = array_map(function ($message) use (
        $attachmentsByMessageId,
        $reactionsByMessageId,
        $mentionsByMessageId,
        $user
    ) {
        $messageId = (int) $message['id'];
        $isDeleted = $message['deleted_at'] !== null;
        $canModify = message_can_be_modified_by($message, 'agent', (int) $user['id']);
        $mentionedUsers = $isDeleted ? [] : ($mentionsByMessageId[$messageId] ?? []);
        $mentionedMe = count(array_filter(
            $mentionedUsers,
            static fn ($mentionedUser) => (int) $mentionedUser['id'] === (int) $user['id']
        )) > 0;

        return [
            'id' => $messageId,
            'conversation_id' => (int) $message['conversation_id'],
            'sender_type' => $message['sender_type'],
            'message_type' => $message['message_type'],
            'is_internal' => $message['message_type'] === 'internal_note',
            'sender_id' => $message['sender_id'] !== null ? (int) $message['sender_id'] : null,
            'sender_name' => $message['sender_type'] === 'agent' ? $message['agent_name'] : null,
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
            'has_history' => $message['edited_at'] !== null || $isDeleted,
            'attachments' => $isDeleted ? [] : ($attachmentsByMessageId[$messageId] ?? []),
            'reactions' => $isDeleted ? [] : ($reactionsByMessageId[$messageId] ?? []),
            'mentioned_users' => $mentionedUsers,
            'mentioned_me' => $mentionedMe,
            'created_at' => $message['created_at'],
        ];
    }, $messages);

    $assignmentHistoryStmt = $pdo->prepare("
        SELECT logs.id, logs.action, logs.assignment_method, logs.note, logs.created_at,
               departments.name AS department_name, from_agent.name AS from_agent_name,
               to_agent.name AS to_agent_name, actor.name AS actor_name
        FROM conversation_assignment_logs AS logs
        LEFT JOIN departments ON departments.id = logs.department_id
        LEFT JOIN users AS from_agent ON from_agent.id = logs.from_agent_id
        LEFT JOIN users AS to_agent ON to_agent.id = logs.to_agent_id
        LEFT JOIN users AS actor ON actor.id = logs.actor_user_id
        WHERE logs.conversation_id = :conversation_id
        ORDER BY logs.id DESC LIMIT 30
    ");
    $assignmentHistoryStmt->execute([':conversation_id' => $conversationId]);
    $assignmentHistory = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        'action' => $row['action'],
        'assignment_method' => $row['assignment_method'],
        'department_name' => $row['department_name'],
        'from_agent_name' => $row['from_agent_name'],
        'to_agent_name' => $row['to_agent_name'],
        'actor_name' => $row['actor_name'],
        'note' => $row['note'],
        'created_at' => $row['created_at'],
    ], $assignmentHistoryStmt->fetchAll());

    $automationTags = [];
    $automationSla = null;
    $automationHistory = [];
    if (automation_tables_ready($pdo)) {
        $tagsStmt = $pdo->prepare("
            SELECT conversation_tags.id, conversation_tags.name, conversation_tags.color
            FROM conversation_tag_assignments
            INNER JOIN conversation_tags ON conversation_tags.id = conversation_tag_assignments.tag_id
            WHERE conversation_tag_assignments.conversation_id = :conversation_id
            ORDER BY conversation_tags.name
        ");
        $tagsStmt->execute([':conversation_id' => $conversationId]);
        $automationTags = array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'color' => $row['color'],
        ], $tagsStmt->fetchAll());

        $slaStatusStmt = $pdo->prepare("
            SELECT conversation_sla_status.state, conversation_sla_status.first_response_due_at,
                   conversation_sla_status.resolution_due_at, conversation_sla_status.first_response_at,
                   conversation_sla_status.warning_sent_at, conversation_sla_status.first_response_breached_at,
                   conversation_sla_status.resolution_breached_at, conversation_sla_status.last_checked_at,
                   automation_sla_policies.id AS policy_id, automation_sla_policies.name AS policy_name
            FROM conversation_sla_status
            INNER JOIN automation_sla_policies ON automation_sla_policies.id = conversation_sla_status.policy_id
            WHERE conversation_sla_status.conversation_id = :conversation_id
              AND automation_sla_policies.tenant_id = :tenant_id
            LIMIT 1
        ");
        $slaStatusStmt->execute([
            ':conversation_id' => $conversationId,
            ':tenant_id' => (int) $conversation['site_tenant_id'],
        ]);
        $slaRow = $slaStatusStmt->fetch();
        if ($slaRow) {
            $slaRow['policy_id'] = (int) $slaRow['policy_id'];
            $automationSla = $slaRow;
        }

        $automationHistoryStmt = $pdo->prepare("
            SELECT id, rule_id, rule_name, trigger_type, status, duration_ms, error_message, created_at
            FROM automation_execution_logs
            WHERE conversation_id = :conversation_id AND tenant_id = :tenant_id
            ORDER BY id DESC
            LIMIT 8
        ");
        $automationHistoryStmt->execute([
            ':conversation_id' => $conversationId,
            ':tenant_id' => (int) $conversation['site_tenant_id'],
        ]);
        $automationHistory = array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'rule_id' => $row['rule_id'] !== null ? (int) $row['rule_id'] : null,
            'rule_name' => $row['rule_name'],
            'trigger_type' => $row['trigger_type'],
            'status' => $row['status'],
            'duration_ms' => (int) $row['duration_ms'],
            'error_message' => $row['error_message'],
            'created_at' => $row['created_at'],
        ], $automationHistoryStmt->fetchAll());
    }

    json_response([
        'success' => true,
        'conversation' => [
            'id' => (int) $conversation['id'],
            'status' => $conversation['status'],
            'priority' => $conversation['priority'],
            'is_pinned' => (bool) $conversation['is_pinned'],
            'pinned_at' => $conversation['pinned_at'],
            'is_archived' => (bool) $conversation['is_archived'],
            'archived_at' => $conversation['archived_at'],
            'department' => $conversation['department_id'] !== null ? [
                'id' => (int) $conversation['department_id'],
                'name' => $conversation['department_name'] ?? null,
                'color' => $conversation['department_color'] ?? '#2563eb',
                'routing_strategy' => $conversation['routing_strategy'] ?? 'manual',
            ] : null,
            'queue_status' => $conversation['queue_status'],
            'queue_position' => $conversation['queue_position'] !== null ? (int) $conversation['queue_position'] : null,
            'queued_at' => $conversation['queued_at'],
            'assigned_at' => $conversation['assigned_at'],
            'assignment_method' => $conversation['assignment_method'],
            'queue_message' => $conversation['queue_message'] ?? null,
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
                'user_agent' => $conversation['visitor_user_agent'],
                'last_seen_at' => $conversation['visitor_last_seen_at'],
                'is_online' => visitor_is_recently_online($conversation['visitor_last_seen_at']),
            ],
            'assignment_history' => $assignmentHistory,
            'tags' => $automationTags,
            'sla' => $automationSla,
            'automation_history' => $automationHistory,
            'messages' => $presentedMessages,
            'first_unread_message_id' => $firstUnreadMessageId,
            'pagination' => [
                'limit' => $limit,
                'oldest_message_id' => $oldestMessageId,
                'has_more' => $hasMore,
                'around_message_id' => $aroundId > 0 ? $aroundId : null,
            ],
        ],
    ]);
} catch (Exception $e) {
    $payload = ['success' => false, 'message' => 'Failed to load conversation'];
    if (!app_is_production()) {
        safe_api_exception_context($e);
    }
    json_response($payload, 500);
}
