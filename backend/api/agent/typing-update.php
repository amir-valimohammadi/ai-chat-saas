<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/typing-update.php
// هدف: ثبت وضعیت تایپ کردن پشتیبان در یک گفتگو

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$input = get_json_input();

$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$isTyping = !empty($input['is_typing']) ? 1 : 0;

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT id, site_id, status
        FROM conversations
        WHERE id = :conversation_id
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':conversation_id' => $conversationId,
    ]);

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    require_site_access($pdo, $user, (int) $conversation['site_id']);

    if ($conversation['status'] === 'closed' && $isTyping === 1) {
        json_response([
            'success' => false,
            'message' => 'Closed conversation cannot be updated'
        ], 422);
    }

    $stmt = $pdo->prepare("
        INSERT INTO conversation_typing_status (
            conversation_id,
            sender_type,
            actor_id,
            is_typing,
            updated_at
        ) VALUES (
            :conversation_id,
            'agent',
            :actor_id,
            :is_typing,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            is_typing = VALUES(is_typing),
            updated_at = NOW()
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':actor_id' => $user['id'],
        ':is_typing' => $isTyping,
    ]);

    json_response([
        'success' => true,
        'message' => 'Typing status updated successfully',
        'is_typing' => (bool) $isTyping,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update typing status',
        ...safe_api_exception_context($e)
    ], 500);
}