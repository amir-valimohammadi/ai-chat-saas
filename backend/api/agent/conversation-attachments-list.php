<?php

// List and summarize attachments for one accessible conversation.

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

$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;
$type = trim((string) ($_GET['type'] ?? ''));
$query = trim((string) ($_GET['q'] ?? ''));
$page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$limit = isset($_GET['limit']) ? max(10, min(100, (int) $_GET['limit'])) : 40;
$offset = ($page - 1) * $limit;
$allowedTypes = ['', 'image', 'audio', 'document', 'other'];

if ($conversationId <= 0) {
    json_response(['success' => false, 'message' => 'conversation_id is required'], 422);
}
if (!in_array($type, $allowedTypes, true)) {
    json_response(['success' => false, 'message' => 'Invalid attachment type'], 422);
}

try {
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

    $conditions = [
        'messages.conversation_id = :conversation_id',
        'messages.deleted_at IS NULL',
    ];
    $params = [':conversation_id' => $conversationId];

    if ($query !== '') {
        $conditions[] = '(message_attachments.original_name LIKE :query OR messages.content LIKE :message_query)';
        $params[':query'] = '%' . $query . '%';
        $params[':message_query'] = '%' . $query . '%';
    }

    if ($type === 'image') {
        $conditions[] = "message_attachments.mime_type LIKE 'image/%'";
    } elseif ($type === 'audio') {
        $conditions[] = "message_attachments.mime_type LIKE 'audio/%'";
    } elseif ($type === 'document') {
        $conditions[] = "(message_attachments.mime_type = 'application/pdf' OR message_attachments.mime_type LIKE 'text/%' OR message_attachments.mime_type LIKE 'application/msword%' OR message_attachments.mime_type LIKE 'application/vnd.%')";
    } elseif ($type === 'other') {
        $conditions[] = "message_attachments.mime_type NOT LIKE 'image/%' AND message_attachments.mime_type NOT LIKE 'audio/%' AND message_attachments.mime_type <> 'application/pdf' AND message_attachments.mime_type NOT LIKE 'text/%' AND message_attachments.mime_type NOT LIKE 'application/msword%' AND message_attachments.mime_type NOT LIKE 'application/vnd.%'";
    }

    $where = implode(' AND ', $conditions);

    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM message_attachments
        INNER JOIN messages ON messages.id = message_attachments.message_id
        WHERE {$where}
    ");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $summaryStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_files,
            COALESCE(SUM(message_attachments.file_size), 0) AS total_bytes,
            SUM(message_attachments.mime_type LIKE 'image/%') AS image_count,
            SUM(message_attachments.mime_type LIKE 'audio/%') AS audio_count,
            SUM(message_attachments.mime_type = 'application/pdf' OR message_attachments.mime_type LIKE 'text/%' OR message_attachments.mime_type LIKE 'application/msword%' OR message_attachments.mime_type LIKE 'application/vnd.%') AS document_count
        FROM message_attachments
        INNER JOIN messages ON messages.id = message_attachments.message_id
        WHERE messages.conversation_id = :conversation_id
          AND messages.deleted_at IS NULL
    ");
    $summaryStmt->execute([':conversation_id' => $conversationId]);
    $summary = $summaryStmt->fetch();

    $stmt = $pdo->prepare("
        SELECT
            message_attachments.id,
            message_attachments.message_id,
            message_attachments.original_name,
            message_attachments.file_url,
            message_attachments.mime_type,
            message_attachments.file_size,
            message_attachments.created_at,
            messages.sender_type,
            messages.sender_id,
            messages.content AS message_content,
            users.name AS agent_name
        FROM message_attachments
        INNER JOIN messages ON messages.id = message_attachments.message_id
        LEFT JOIN users ON users.id = messages.sender_id AND messages.sender_type = 'agent'
        WHERE {$where}
        ORDER BY message_attachments.id DESC
        LIMIT {$limit} OFFSET {$offset}
    ");
    $stmt->execute($params);

    $items = array_map(static function ($row) {
        $mime = strtolower((string) $row['mime_type']);
        $category = str_starts_with($mime, 'image/')
            ? 'image'
            : (str_starts_with($mime, 'audio/')
                ? 'audio'
                : ($mime === 'application/pdf' || str_starts_with($mime, 'text/') || str_starts_with($mime, 'application/msword') || str_starts_with($mime, 'application/vnd.')
                    ? 'document'
                    : 'other'));

        return [
            'id' => (int) $row['id'],
            'message_id' => (int) $row['message_id'],
            'original_name' => $row['original_name'],
            'file_url' => $row['file_url'],
            'mime_type' => $row['mime_type'],
            'file_size' => (int) $row['file_size'],
            'category' => $category,
            'created_at' => $row['created_at'],
            'sender_type' => $row['sender_type'],
            'sender_name' => $row['sender_type'] === 'agent'
                ? ($row['agent_name'] ?: 'پشتیبان')
                : ($row['sender_type'] === 'visitor' ? 'کاربر' : 'سیستم'),
            'message_content' => $row['message_content'],
        ];
    }, $stmt->fetchAll());

    $totalFiles = (int) ($summary['total_files'] ?? 0);
    $imageCount = (int) ($summary['image_count'] ?? 0);
    $audioCount = (int) ($summary['audio_count'] ?? 0);
    $documentCount = (int) ($summary['document_count'] ?? 0);

    json_response([
        'success' => true,
        'items' => $items,
        'summary' => [
            'total_files' => $totalFiles,
            'total_bytes' => (int) ($summary['total_bytes'] ?? 0),
            'image_count' => $imageCount,
            'audio_count' => $audioCount,
            'document_count' => $documentCount,
            'other_count' => max(0, $totalFiles - $imageCount - $audioCount - $documentCount),
        ],
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => $total,
            'pages' => max(1, (int) ceil($total / $limit)),
        ],
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load conversation attachments',
        'error' => $e->getMessage(),
    ], 500);
}
