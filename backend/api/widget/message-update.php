<?php

// Edit a visitor's own recent message.

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/message-helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$siteKey = trim($input['site_key'] ?? '');
$visitorId = isset($input['visitor_id']) ? (int) $input['visitor_id'] : 0;
$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;
$content = trim($input['content'] ?? '');

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0 || $messageId <= 0 || $content === '') {
    json_response(['success' => false, 'message' => 'Required fields are missing'], 422);
}

if (mb_strlen($content, 'UTF-8') > 4000) {
    json_response(['success' => false, 'message' => 'Message is too long'], 422);
}

enforce_rate_limit($pdo, 'widget_message_update', rate_limit_identifier($siteKey . '|' . $visitorId), 20, 10 * 60);

try {
    $stmt = $pdo->prepare("\n        SELECT messages.*, conversations.site_id, conversations.status AS conversation_status, sites.domain\n        FROM messages\n        INNER JOIN conversations ON conversations.id = messages.conversation_id\n        INNER JOIN sites ON sites.id = conversations.site_id\n        INNER JOIN tenants ON tenants.id = sites.tenant_id\n        WHERE messages.id = :message_id\n          AND messages.conversation_id = :conversation_id\n          AND conversations.visitor_id = :visitor_id\n          AND sites.site_key = :site_key\n          AND sites.is_active = 1\n          AND tenants.status = 'active'\n        LIMIT 1\n    ");
    $stmt->execute([
        ':message_id' => $messageId,
        ':conversation_id' => $conversationId,
        ':visitor_id' => $visitorId,
        ':site_key' => $siteKey,
    ]);
    $message = $stmt->fetch();

    if (!$message) {
        json_response(['success' => false, 'message' => 'Message not found'], 404);
    }

    validate_widget_origin_or_fail($message['domain']);

    if ($message['conversation_status'] === 'closed') {
        json_response(['success' => false, 'message' => 'This conversation is closed'], 422);
    }

    if (!message_can_be_modified_by($message, 'visitor', $visitorId)) {
        json_response(['success' => false, 'message' => 'This message can no longer be edited'], 403);
    }

    $pdo->beginTransaction();
    $revisionStmt = $pdo->prepare("\n        INSERT INTO message_revisions (message_id, editor_type, editor_id, action, previous_content, new_content)\n        VALUES (:message_id, 'visitor', :editor_id, 'edit', :previous_content, :new_content)\n    ");
    $revisionStmt->execute([
        ':message_id' => $messageId,
        ':editor_id' => $visitorId,
        ':previous_content' => $message['content'],
        ':new_content' => $content,
    ]);

    $updateStmt = $pdo->prepare("UPDATE messages SET content = :content, edited_at = NOW() WHERE id = :message_id AND deleted_at IS NULL");
    $updateStmt->execute([':content' => $content, ':message_id' => $messageId]);
    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Message updated successfully',
        'data' => [
            'id' => $messageId,
            'content' => $content,
            'edited_at' => date('Y-m-d H:i:s'),
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $payload = ['success' => false, 'message' => 'Failed to update message'];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
