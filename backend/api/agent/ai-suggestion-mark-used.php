<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/ai-suggestion-mark-used.php
// هدف: ثبت اینکه پشتیبان از پیشنهاد AI استفاده کرده است

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

$suggestionId = isset($input['suggestion_id']) ? (int) $input['suggestion_id'] : 0;

if ($suggestionId <= 0) {
    json_response([
        'success' => false,
        'message' => 'suggestion_id is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        SELECT
            ai_suggestions.id,
            ai_suggestions.conversation_id,
            conversations.site_id
        FROM ai_suggestions
        INNER JOIN conversations ON conversations.id = ai_suggestions.conversation_id
        WHERE ai_suggestions.id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $suggestionId,
    ]);

    $suggestion = $stmt->fetch();

    if (!$suggestion) {
        json_response([
            'success' => false,
            'message' => 'AI suggestion not found'
        ], 404);
    }

    require_site_access($pdo, $user, (int) $suggestion['site_id']);

    $updateStmt = $pdo->prepare("
        UPDATE ai_suggestions
        SET status = 'used'
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':id' => $suggestionId,
    ]);

    json_response([
        'success' => true,
        'message' => 'AI suggestion marked as used'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to mark AI suggestion as used',
        ...safe_api_exception_context($e)
    ], 500);
}