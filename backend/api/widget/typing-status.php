<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/typing-status.php
// هدف: دریافت وضعیت تایپ پشتیبان برای نمایش داخل ویجت

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$siteKey = trim($_GET['site_key'] ?? '');
$visitorId = isset($_GET['visitor_id']) ? (int) $_GET['visitor_id'] : 0;
$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_key, visitor_id and conversation_id are required'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT conversations.id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE conversations.id = :conversation_id
          AND conversations.visitor_id = :visitor_id
          AND sites.site_key = :site_key
          AND sites.is_active = 1
          AND tenants.status = 'active'
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':conversation_id' => $conversationId,
        ':visitor_id' => $visitorId,
        ':site_key' => $siteKey,
    ]);

    if (!$conversationStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    $typingStmt = $pdo->prepare("
        SELECT
            conversation_typing_status.actor_id,
            conversation_typing_status.updated_at,
            users.name AS agent_name
        FROM conversation_typing_status
        LEFT JOIN users ON users.id = conversation_typing_status.actor_id
        WHERE conversation_typing_status.conversation_id = :conversation_id
          AND conversation_typing_status.sender_type = 'agent'
          AND conversation_typing_status.is_typing = 1
          AND conversation_typing_status.updated_at >= (NOW() - INTERVAL 6 SECOND)
        ORDER BY conversation_typing_status.updated_at DESC
        LIMIT 1
    ");

    $typingStmt->execute([
        ':conversation_id' => $conversationId,
    ]);

    $typing = $typingStmt->fetch();

    $agentName = $typing['agent_name'] ?? null;

    json_response([
        'success' => true,
        'typing' => [
            'is_typing' => (bool) $typing,
            'agent_name' => $agentName,
            'text' => $typing
                ? (($agentName ? $agentName : 'پشتیبان') . ' در حال نوشتن...')
                : '',
        ],
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load typing status',
        'error' => $e->getMessage()
    ], 500);
}