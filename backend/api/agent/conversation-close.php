<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/conversation-close.php
// هدف: بستن یک گفتگو توسط پشتیبان یا مدیر مشتری

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

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT id, site_id
        FROM conversations
        WHERE id = :id
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':id' => $conversationId
    ]);

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    require_site_access($pdo, $user, (int) $conversation['site_id']);

    $stmt = $pdo->prepare("
        UPDATE conversations
        SET
            status = 'closed',
            closed_at = NOW()
        WHERE id = :id
    ");

    $stmt->execute([
        ':id' => $conversationId
    ]);

    json_response([
        'success' => true,
        'message' => 'Conversation closed successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to close conversation',
        'error' => $e->getMessage()
    ], 500);
}