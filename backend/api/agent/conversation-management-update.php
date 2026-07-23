<?php

// Update conversation priority, pin and archive state.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();
$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;

if ($conversationId <= 0) {
    json_response(['success' => false, 'message' => 'conversation_id is required'], 422);
}

$allowedPriorities = ['low', 'normal', 'high', 'urgent'];
$updates = [];
$params = [':conversation_id' => $conversationId];

if (array_key_exists('priority', $input)) {
    $priority = trim((string) $input['priority']);
    if (!in_array($priority, $allowedPriorities, true)) {
        json_response(['success' => false, 'message' => 'Invalid priority'], 422);
    }
    $updates[] = 'priority = :priority';
    $params[':priority'] = $priority;
}

if (array_key_exists('is_pinned', $input)) {
    $isPinned = filter_var($input['is_pinned'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($isPinned === null) {
        json_response(['success' => false, 'message' => 'Invalid is_pinned value'], 422);
    }
    $updates[] = 'is_pinned = :is_pinned_value';
    $updates[] = 'pinned_at = CASE WHEN :is_pinned_case = 1 THEN NOW() ELSE NULL END';
    $params[':is_pinned_value'] = $isPinned ? 1 : 0;
    $params[':is_pinned_case'] = $isPinned ? 1 : 0;
}

if (array_key_exists('is_archived', $input)) {
    $isArchived = filter_var($input['is_archived'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($isArchived === null) {
        json_response(['success' => false, 'message' => 'Invalid is_archived value'], 422);
    }
    $updates[] = 'is_archived = :is_archived_value';
    $updates[] = 'archived_at = CASE WHEN :is_archived_case = 1 THEN NOW() ELSE NULL END';
    if ($isArchived) {
        $updates[] = 'is_pinned = 0';
        $updates[] = 'pinned_at = NULL';
    }
    $params[':is_archived_value'] = $isArchived ? 1 : 0;
    $params[':is_archived_case'] = $isArchived ? 1 : 0;
}

if (!$updates) {
    json_response(['success' => false, 'message' => 'No management field was provided'], 422);
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

    $stmt = $pdo->prepare('UPDATE conversations SET ' . implode(', ', $updates) . ' WHERE id = :conversation_id');
    $stmt->execute($params);

    $showStmt = $pdo->prepare("
        SELECT priority, is_pinned, pinned_at, is_archived, archived_at
        FROM conversations
        WHERE id = :conversation_id
    ");
    $showStmt->execute([':conversation_id' => $conversationId]);
    $state = $showStmt->fetch();

    json_response([
        'success' => true,
        'message' => 'Conversation management settings updated',
        'management' => [
            'priority' => $state['priority'],
            'is_pinned' => (bool) $state['is_pinned'],
            'pinned_at' => $state['pinned_at'],
            'is_archived' => (bool) $state['is_archived'],
            'archived_at' => $state['archived_at'],
        ],
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update conversation management settings',
        'error' => $e->getMessage(),
    ], 500);
}
