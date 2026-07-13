<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/ai-suggestion-generate.php
// هدف: تولید پیشنهاد پاسخ برای آخرین پیام کاربر بر اساس Knowledge Base

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/knowledge-search.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

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

    $siteId = (int) $conversation['site_id'];
    require_site_plan_feature(
        $pdo,
        $siteId,
        'ai_suggestions_enabled',
        'AI Suggestions'
    );

    require_site_access($pdo, $user, $siteId);

    $messageStmt = $pdo->prepare("
        SELECT id, content
        FROM messages
        WHERE conversation_id = :conversation_id
          AND sender_type = 'visitor'
        ORDER BY id DESC
        LIMIT 1
    ");

    $messageStmt->execute([
        ':conversation_id' => $conversationId
    ]);

    $lastVisitorMessage = $messageStmt->fetch();

    if (!$lastVisitorMessage) {
        json_response([
            'success' => false,
            'message' => 'No visitor message found for this conversation'
        ], 404);
    }

    $sources = find_relevant_knowledge($pdo, $siteId, $lastVisitorMessage['content'], 5);

    $suggestionData = build_suggested_reply_from_knowledge(
        $lastVisitorMessage['content'],
        $sources
    );

    $insertStmt = $pdo->prepare("
        INSERT INTO ai_suggestions (
            conversation_id,
            message_id,
            suggested_reply,
            confidence,
            sources_json,
            status
        ) VALUES (
            :conversation_id,
            :message_id,
            :suggested_reply,
            :confidence,
            :sources_json,
            'pending'
        )
    ");

    $insertStmt->execute([
        ':conversation_id' => $conversationId,
        ':message_id' => (int) $lastVisitorMessage['id'],
        ':suggested_reply' => $suggestionData['reply'],
        ':confidence' => $suggestionData['confidence'],
        ':sources_json' => json_encode($suggestionData['sources'], JSON_UNESCAPED_UNICODE),
    ]);

    $suggestionId = (int) $pdo->lastInsertId();

    json_response([
        'success' => true,
        'message' => 'AI suggestion generated successfully',
        'suggestion' => [
            'id' => $suggestionId,
            'conversation_id' => $conversationId,
            'message_id' => (int) $lastVisitorMessage['id'],
            'suggested_reply' => $suggestionData['reply'],
            'confidence' => $suggestionData['confidence'],
            'sources' => $suggestionData['sources'],
            'status' => 'pending',
        ]
    ], 201);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to generate AI suggestion',
        'error' => $e->getMessage()
    ], 500);
}