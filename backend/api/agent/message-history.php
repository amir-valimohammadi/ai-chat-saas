<?php

// Return edit/delete history for a message to authorized agents.

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
$messageId = isset($_GET['message_id']) ? (int) $_GET['message_id'] : 0;

if ($messageId <= 0) {
    json_response(['success' => false, 'message' => 'message_id is required'], 422);
}

try {
    $messageStmt = $pdo->prepare("\n        SELECT messages.id, conversations.site_id\n        FROM messages\n        INNER JOIN conversations ON conversations.id = messages.conversation_id\n        WHERE messages.id = :message_id\n        LIMIT 1\n    ");
    $messageStmt->execute([':message_id' => $messageId]);
    $message = $messageStmt->fetch();

    if (!$message) {
        json_response(['success' => false, 'message' => 'Message not found'], 404);
    }

    require_site_access($pdo, $user, (int) $message['site_id']);

    $stmt = $pdo->prepare("\n        SELECT\n            message_revisions.id,\n            message_revisions.message_id,\n            message_revisions.editor_type,\n            message_revisions.editor_id,\n            message_revisions.action,\n            message_revisions.previous_content,\n            message_revisions.new_content,\n            message_revisions.created_at,\n            users.name AS editor_name\n        FROM message_revisions\n        LEFT JOIN users\n            ON users.id = message_revisions.editor_id\n            AND message_revisions.editor_type = 'agent'\n        WHERE message_revisions.message_id = :message_id\n        ORDER BY message_revisions.id DESC\n    ");
    $stmt->execute([':message_id' => $messageId]);

    json_response([
        'success' => true,
        'revisions' => array_map(static function (array $revision): array {
            return [
                'id' => (int) $revision['id'],
                'message_id' => (int) $revision['message_id'],
                'editor_type' => $revision['editor_type'],
                'editor_id' => $revision['editor_id'] !== null ? (int) $revision['editor_id'] : null,
                'editor_name' => $revision['editor_name'],
                'action' => $revision['action'],
                'previous_content' => $revision['previous_content'],
                'new_content' => $revision['new_content'],
                'created_at' => $revision['created_at'],
            ];
        }, $stmt->fetchAll()),
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load message history'];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
