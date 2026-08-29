<?php

// Advanced inbox list with server-side search, filters and pagination.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$allowedStatuses = ['', 'new', 'open', 'in_progress', 'waiting_customer', 'follow_up', 'pending', 'closed'];
$allowedPriorities = ['', 'low', 'normal', 'high', 'urgent'];
$status = trim((string) ($_GET['status'] ?? ''));
$priority = trim((string) ($_GET['priority'] ?? ''));
$query = trim((string) ($_GET['q'] ?? ''));
$assignedAgentId = isset($_GET['assigned_agent_id']) && $_GET['assigned_agent_id'] !== '' ? (int) $_GET['assigned_agent_id'] : 0;
$siteId = isset($_GET['site_id']) && $_GET['site_id'] !== '' ? (int) $_GET['site_id'] : 0;
$departmentId = isset($_GET['department_id']) && $_GET['department_id'] !== '' ? (int) $_GET['department_id'] : 0;
$page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$limit = isset($_GET['limit']) ? max(10, min(100, (int) $_GET['limit'])) : 50;
$offset = ($page - 1) * $limit;
$archived = trim((string) ($_GET['archived'] ?? '0'));
$dateFrom = trim((string) ($_GET['date_from'] ?? ''));
$dateTo = trim((string) ($_GET['date_to'] ?? ''));

if (!in_array($status, $allowedStatuses, true) || !in_array($priority, $allowedPriorities, true)) {
    json_response(['success' => false, 'message' => 'Invalid inbox filter'], 422);
}
if (!in_array($archived, ['0', '1', 'all'], true)) {
    json_response(['success' => false, 'message' => 'Invalid archived filter'], 422);
}
if ($dateFrom !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) {
    json_response(['success' => false, 'message' => 'Invalid date_from'], 422);
}
if ($dateTo !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
    json_response(['success' => false, 'message' => 'Invalid date_to'], 422);
}

$flag = static function (string $name): bool {
    return isset($_GET[$name]) && in_array((string) $_GET[$name], ['1', 'true'], true);
};

$conditions = ['sites.tenant_id = :tenant_id'];
$params = [
    ':tenant_id' => (int) $user['tenant_id'],
    ':mention_user_id' => (int) $user['id'],
];

if ($user['role'] === 'agent') {
    $conditions[] = 'EXISTS (
        SELECT 1 FROM agent_site_access
        WHERE agent_site_access.site_id = conversations.site_id
          AND agent_site_access.user_id = :access_user_id
    )';
    $params[':access_user_id'] = (int) $user['id'];
}

if ($archived !== 'all') {
    $conditions[] = 'conversations.is_archived = :is_archived';
    $params[':is_archived'] = $archived === '1' ? 1 : 0;
}
if ($status !== '') {
    $conditions[] = 'conversations.status = :status';
    $params[':status'] = $status;
}
if ($priority !== '') {
    $conditions[] = 'conversations.priority = :priority';
    $params[':priority'] = $priority;
}
if ($assignedAgentId > 0) {
    $conditions[] = 'conversations.assigned_agent_id = :assigned_agent_id';
    $params[':assigned_agent_id'] = $assignedAgentId;
}
if ($siteId > 0) {
    $conditions[] = 'conversations.site_id = :site_id';
    $params[':site_id'] = $siteId;
}
if ($departmentId > 0) {
    $conditions[] = 'conversations.department_id = :department_id';
    $params[':department_id'] = $departmentId;
}
if ($flag('unassigned')) {
    $conditions[] = 'conversations.assigned_agent_id IS NULL';
}
if ($flag('pinned')) {
    $conditions[] = 'conversations.is_pinned = 1';
}
if ($flag('queued')) {
    $conditions[] = "conversations.queue_status = 'waiting'";
}
if ($flag('unread')) {
    $conditions[] = 'EXISTS (
        SELECT 1 FROM messages unread_messages
        WHERE unread_messages.conversation_id = conversations.id
          AND unread_messages.sender_type = \'visitor\'
          AND unread_messages.read_at IS NULL
          AND unread_messages.deleted_at IS NULL
    )';
}
if ($flag('has_file')) {
    $conditions[] = 'EXISTS (
        SELECT 1 FROM messages file_messages
        INNER JOIN message_attachments ON message_attachments.message_id = file_messages.id
        WHERE file_messages.conversation_id = conversations.id
          AND file_messages.deleted_at IS NULL
    )';
}
if ($flag('has_voice')) {
    $conditions[] = 'EXISTS (
        SELECT 1 FROM messages voice_messages
        WHERE voice_messages.conversation_id = conversations.id
          AND voice_messages.message_type = \'voice\'
          AND voice_messages.deleted_at IS NULL
    )';
}
if ($flag('has_internal_note')) {
    $conditions[] = 'EXISTS (
        SELECT 1 FROM messages note_messages
        WHERE note_messages.conversation_id = conversations.id
          AND note_messages.message_type = \'internal_note\'
          AND note_messages.deleted_at IS NULL
    )';
}
if ($flag('has_mention')) {
    $conditions[] = 'EXISTS (
        SELECT 1 FROM message_mentions filter_mentions
        INNER JOIN messages mention_messages ON mention_messages.id = filter_mentions.message_id
        WHERE mention_messages.conversation_id = conversations.id
          AND mention_messages.deleted_at IS NULL
          AND filter_mentions.mentioned_user_id = :filter_mention_user_id
    )';
    $params[':filter_mention_user_id'] = (int) $user['id'];
}
if ($dateFrom !== '') {
    $conditions[] = 'conversations.created_at >= :date_from';
    $params[':date_from'] = $dateFrom . ' 00:00:00';
}
if ($dateTo !== '') {
    $conditions[] = 'conversations.created_at <= :date_to';
    $params[':date_to'] = $dateTo . ' 23:59:59';
}
if ($query !== '') {
    $conditions[] = '(
        CAST(conversations.id AS CHAR) LIKE :query_id
        OR visitors.name LIKE :query_name
        OR visitors.email LIKE :query_email
        OR visitors.phone LIKE :query_phone
        OR sites.name LIKE :query_site
        OR conversations.source_page_title LIKE :query_page
        OR assigned_agent.name LIKE :query_agent
        OR departments.name LIKE :query_department
        OR EXISTS (
            SELECT 1 FROM messages search_messages
            WHERE search_messages.conversation_id = conversations.id
              AND search_messages.deleted_at IS NULL
              AND search_messages.content LIKE :query_message
        )
        OR EXISTS (
            SELECT 1 FROM messages attachment_messages
            INNER JOIN message_attachments search_attachments ON search_attachments.message_id = attachment_messages.id
            WHERE attachment_messages.conversation_id = conversations.id
              AND attachment_messages.deleted_at IS NULL
              AND search_attachments.original_name LIKE :query_attachment
        )
    )';
    foreach (['query_id','query_name','query_email','query_phone','query_site','query_page','query_agent','query_department','query_message','query_attachment'] as $key) {
        $params[':' . $key] = '%' . $query . '%';
    }
}

$where = implode(' AND ', $conditions);

try {
    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN users AS assigned_agent
          ON assigned_agent.id = conversations.assigned_agent_id
          AND assigned_agent.tenant_id = sites.tenant_id
        LEFT JOIN departments ON departments.id = conversations.department_id
        WHERE {$where}
    ");
    $countParams = $params;
    unset($countParams[':mention_user_id']);
    $countStmt->execute($countParams);
    $total = (int) $countStmt->fetchColumn();

    $sql = "
        SELECT
            conversations.id,
            conversations.status,
            conversations.priority,
            conversations.is_pinned,
            conversations.pinned_at,
            conversations.is_archived,
            conversations.archived_at,
            conversations.department_id,
            conversations.queue_status,
            conversations.queue_position,
            conversations.queued_at,
            conversations.assigned_at,
            conversations.assignment_method,
            departments.name AS department_name,
            departments.color AS department_color,
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
                SELECT content FROM messages
                WHERE messages.conversation_id = conversations.id
                  AND messages.message_type <> 'internal_note'
                  AND messages.deleted_at IS NULL
                ORDER BY messages.id DESC LIMIT 1
            ) AS last_message,
            (
                SELECT COUNT(*) FROM messages
                WHERE messages.conversation_id = conversations.id
                  AND messages.sender_type = 'visitor'
                  AND messages.read_at IS NULL
                  AND messages.deleted_at IS NULL
            ) AS unread_count,
            (
                SELECT COUNT(*)
                FROM message_mentions
                INNER JOIN messages AS mention_messages ON mention_messages.id = message_mentions.message_id
                WHERE mention_messages.conversation_id = conversations.id
                  AND mention_messages.message_type = 'internal_note'
                  AND mention_messages.deleted_at IS NULL
                  AND message_mentions.mentioned_user_id = :mention_user_id
                  AND message_mentions.read_at IS NULL
            ) AS unread_mention_count,
            (
                SELECT COUNT(*) FROM messages
                WHERE messages.conversation_id = conversations.id
                  AND messages.deleted_at IS NULL
            ) AS message_count,
            (
                SELECT COUNT(*)
                FROM messages attachment_messages
                INNER JOIN message_attachments ON message_attachments.message_id = attachment_messages.id
                WHERE attachment_messages.conversation_id = conversations.id
                  AND attachment_messages.deleted_at IS NULL
            ) AS attachment_count,
            EXISTS (
                SELECT 1 FROM messages voice_messages
                WHERE voice_messages.conversation_id = conversations.id
                  AND voice_messages.message_type = 'voice'
                  AND voice_messages.deleted_at IS NULL
            ) AS has_voice,
            EXISTS (
                SELECT 1 FROM messages note_messages
                WHERE note_messages.conversation_id = conversations.id
                  AND note_messages.message_type = 'internal_note'
                  AND note_messages.deleted_at IS NULL
            ) AS has_internal_note
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN users AS assigned_agent
          ON assigned_agent.id = conversations.assigned_agent_id
          AND assigned_agent.tenant_id = sites.tenant_id
        LEFT JOIN departments ON departments.id = conversations.department_id
        WHERE {$where}
        ORDER BY
            conversations.is_pinned DESC,
            FIELD(conversations.priority, 'urgent', 'high', 'normal', 'low'),
            conversations.last_message_at DESC,
            conversations.id DESC
        LIMIT {$limit} OFFSET {$offset}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $conversations = array_map(static function ($conversation) {
        return [
            'id' => (int) $conversation['id'],
            'status' => $conversation['status'],
            'priority' => $conversation['priority'],
            'is_pinned' => (bool) $conversation['is_pinned'],
            'pinned_at' => $conversation['pinned_at'],
            'is_archived' => (bool) $conversation['is_archived'],
            'archived_at' => $conversation['archived_at'],
            'department' => $conversation['department_id'] !== null ? [
                'id' => (int) $conversation['department_id'],
                'name' => $conversation['department_name'],
                'color' => $conversation['department_color'],
            ] : null,
            'queue_status' => $conversation['queue_status'],
            'queue_position' => $conversation['queue_position'] !== null ? (int) $conversation['queue_position'] : null,
            'queued_at' => $conversation['queued_at'],
            'assigned_at' => $conversation['assigned_at'],
            'assignment_method' => $conversation['assignment_method'],
            'site' => ['id' => (int) $conversation['site_id'], 'name' => $conversation['site_name']],
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
            'unread_count' => (int) $conversation['unread_count'],
            'has_unread' => (int) $conversation['unread_count'] > 0,
            'unread_mention_count' => (int) $conversation['unread_mention_count'],
            'has_unread_mention' => (int) $conversation['unread_mention_count'] > 0,
            'message_count' => (int) $conversation['message_count'],
            'attachment_count' => (int) $conversation['attachment_count'],
            'has_file' => (int) $conversation['attachment_count'] > 0,
            'has_voice' => (bool) $conversation['has_voice'],
            'has_internal_note' => (bool) $conversation['has_internal_note'],
        ];
    }, $rows);

    json_response([
        'success' => true,
        'conversations' => $conversations,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => $total,
            'pages' => max(1, (int) ceil($total / $limit)),
        ],
        'filters' => [
            'status' => $status,
            'priority' => $priority,
            'q' => $query,
            'archived' => $archived,
        ],
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load conversations',
        ...safe_api_exception_context($e),
    ], 500);
}
