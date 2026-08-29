<?php

// Soft-delete an agent's own recent message and preserve audit history.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();
$messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;

if ($messageId <= 0) {
    json_response(['success' => false, 'message' => 'message_id is required'], 422);
}

try {
    $stmt = $pdo->prepare("\n        SELECT messages.*, conversations.site_id, conversations.status AS conversation_status\n        FROM messages\n        INNER JOIN conversations ON conversations.id = messages.conversation_id\n        WHERE messages.id = :message_id\n        LIMIT 1\n    ");
    $stmt->execute([':message_id' => $messageId]);
    $message = $stmt->fetch();

    if (!$message) {
        json_response(['success' => false, 'message' => 'Message not found'], 404);
    }

    require_site_access($pdo, $user, (int) $message['site_id']);

    if ($message['conversation_status'] === 'closed') {
        json_response(['success' => false, 'message' => 'This conversation is closed'], 422);
    }

    if (!message_can_be_modified_by($message, 'agent', (int) $user['id'])) {
        json_response([
            'success' => false,
            'message' => 'This message can no longer be deleted or does not belong to you',
        ], 403);
    }

    $pdo->beginTransaction();

    $revisionStmt = $pdo->prepare("\n        INSERT INTO message_revisions (\n            message_id, editor_type, editor_id, action, previous_content, new_content\n        ) VALUES (\n            :message_id, 'agent', :editor_id, 'delete', :previous_content, NULL\n        )\n    ");
    $revisionStmt->execute([
        ':message_id' => $messageId,
        ':editor_id' => $user['id'],
        ':previous_content' => $message['content'],
    ]);

    $deleteStmt = $pdo->prepare("\n        UPDATE messages\n        SET\n            content = 'این پیام حذف شده است.',\n            deleted_at = NOW(),\n            deleted_by_type = 'agent',\n            deleted_by_id = :editor_id\n        WHERE id = :message_id\n          AND deleted_at IS NULL\n    ");
    $deleteStmt->execute([':editor_id' => $user['id'], ':message_id' => $messageId]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Message deleted successfully',
        'data' => ['id' => $messageId, 'deleted_at' => date('Y-m-d H:i:s')],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = ['success' => false, 'message' => 'Failed to delete message'];
    if (!app_is_production()) {
        safe_api_exception_context($e);
    }
    json_response($payload, 500);
}
