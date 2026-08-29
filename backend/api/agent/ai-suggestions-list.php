<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/ai-suggestions-list.php
// هدف: دریافت پیشنهادهای AI یک گفتگو

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;

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
        SELECT
            id,
            conversation_id,
            message_id,
            suggested_reply,
            confidence,
            sources_json,
            status,
            created_at
        FROM ai_suggestions
        WHERE conversation_id = :conversation_id
        ORDER BY id DESC
        LIMIT 10
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId
    ]);

    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'suggestions' => array_map(function ($item) {
            return [
                'id' => (int) $item['id'],
                'conversation_id' => (int) $item['conversation_id'],
                'message_id' => (int) $item['message_id'],
                'suggested_reply' => $item['suggested_reply'],
                'confidence' => (float) $item['confidence'],
                'sources' => $item['sources_json'] ? json_decode($item['sources_json'], true) : [],
                'status' => $item['status'],
                'created_at' => $item['created_at'],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load AI suggestions',
        ...safe_api_exception_context($e)
    ], 500);
}