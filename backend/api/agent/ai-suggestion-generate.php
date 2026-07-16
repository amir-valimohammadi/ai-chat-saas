<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/ai-suggestion-generate.php
// هدف: تولید پیشنهاد پاسخ برای پشتیبان با موتور ترکیبی AI
// منابع: knowledge_sources + ai_generated_questions + ai_content_chunks

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-answer-engine.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/subscription.php';

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
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.status AS conversation_status,
            sites.tenant_id,
            sites.name AS site_name,
            sites.domain,
            sites.site_key,
            sites.ai_mode
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE conversations.id = :id
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
    require_active_subscription($pdo, (int) $conversation['tenant_id'], 'ai_suggestion');
    require_site_access($pdo, $user, $siteId);

    require_site_plan_feature(
        $pdo,
        $siteId,
        'ai_suggestions_enabled',
        'AI Suggestions'
    );

    if ($conversation['conversation_status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'Conversation is closed'
        ], 422);
    }

    if (!in_array($conversation['ai_mode'], ['assistant', 'semi_auto'], true)) {
        json_response([
            'success' => false,
            'message' => 'AI suggestions are disabled for this site'
        ], 422);
    }

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

    $settingsStmt = $pdo->prepare("
        SELECT *
        FROM ai_site_settings
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
        LIMIT 1
    ");

    $settingsStmt->execute([
        ':tenant_id' => (int) $conversation['tenant_id'],
        ':site_id' => $siteId,
    ]);

    $settings = $settingsStmt->fetch();

    if ($settings && (int) $settings['assistant_enabled'] !== 1) {
        json_response([
            'success' => false,
            'message' => 'AI assistant is disabled for this site'
        ], 422);
    }

    $minSuggestionScore = $settings ? (float) $settings['min_suggestion_score'] : 45.00;

    $fallbackMessage = $settings && !empty($settings['fallback_message'])
        ? $settings['fallback_message']
        : 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. لطفاً اطلاعات بیشتری از کاربر بگیرید یا پاسخ را به دانش AI اضافه کنید.';

    $site = [
        'id' => $siteId,
        'tenant_id' => (int) $conversation['tenant_id'],
        'name' => $conversation['site_name'],
        'domain' => $conversation['domain'],
        'site_key' => $conversation['site_key'],
    ];

    $question = trim((string) $lastVisitorMessage['content']);

    $result = ai_find_best_answer($pdo, $site, $question);

    $confidenceScore = (float) ($result['confidence_score'] ?? 0);
    $hasGoodAnswer = $result['success'] && $confidenceScore >= $minSuggestionScore;

    $suggestedReply = $hasGoodAnswer
        ? $result['answer']
        : $fallbackMessage;

    $confidenceForSuggestion = round(max(0.05, min(1.00, $confidenceScore / 100)), 2);
    $sources = $result['sources'] ?? [];
    $failureReason = ai_failure_reason($result, $minSuggestionScore);

    $pdo->beginTransaction();

    if (!$hasGoodAnswer) {
        ai_record_unanswered_question($pdo, [
            'tenant_id' => (int) $conversation['tenant_id'],
            'site_id' => $siteId,
            'conversation_id' => $conversationId,
            'message_id' => (int) $lastVisitorMessage['id'],
            'question' => $question,
            'detected_category' => $result['detected']['category'] ?? null,
            'detected_intent' => $result['detected']['intent'] ?? null,
            'best_match_score' => $confidenceScore,
            'best_sources' => $sources,
            'failure_reason' => $failureReason,
        ]);
    }

    $existingPendingStmt = $pdo->prepare("
    SELECT id
    FROM ai_suggestions
    WHERE conversation_id = :conversation_id
      AND message_id = :message_id
      AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
");

    $existingPendingStmt->execute([
        ':conversation_id' => $conversationId,
        ':message_id' => (int) $lastVisitorMessage['id'],
    ]);

    $existingPending = $existingPendingStmt->fetch();

    if ($existingPending) {
        $suggestionId = (int) $existingPending['id'];

        $updateSuggestionStmt = $pdo->prepare("
        UPDATE ai_suggestions
        SET
            suggested_reply = :suggested_reply,
            confidence = :confidence,
            sources_json = :sources_json
        WHERE id = :id
    ");

        $updateSuggestionStmt->execute([
            ':suggested_reply' => $suggestedReply,
            ':confidence' => $confidenceForSuggestion,
            ':sources_json' => json_encode($sources, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':id' => $suggestionId,
        ]);
    } else {
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
            ':suggested_reply' => $suggestedReply,
            ':confidence' => $confidenceForSuggestion,
            ':sources_json' => json_encode($sources, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        $suggestionId = (int) $pdo->lastInsertId();
    }

    ai_log_answer($pdo, [
        'tenant_id' => (int) $conversation['tenant_id'],
        'site_id' => $siteId,
        'conversation_id' => $conversationId,
        'message_id' => (int) $lastVisitorMessage['id'],
        'user_question' => $question,
        'reply_text' => $suggestedReply,
        'confidence_score' => $confidenceScore,
        'matched_chunk_id' => $result['matched_chunk_id'] ?? null,
        'matched_question_id' => $result['matched_question_id'] ?? null,
        'sources' => $sources,
        'reply_mode' => $hasGoodAnswer ? 'suggestion' : 'no_answer',
        'request_source' => 'agent',
        'failure_reason' => $failureReason,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'AI suggestion generated successfully',
        'suggestion' => [
            'id' => $suggestionId,
            'conversation_id' => $conversationId,
            'message_id' => (int) $lastVisitorMessage['id'],
            'suggested_reply' => $suggestedReply,
            'confidence' => $confidenceForSuggestion,
            'confidence_score' => $confidenceScore,
            'min_suggestion_score' => $minSuggestionScore,
            'answered' => $hasGoodAnswer,
            'sources' => $sources,
            'status' => 'pending',
        ],
        'debug' => [
            'matched_type' => $result['matched_type'] ?? null,
            'matched_knowledge_source_id' => $result['matched_knowledge_source_id'] ?? null,
            'matched_question_id' => $result['matched_question_id'] ?? null,
            'matched_chunk_id' => $result['matched_chunk_id'] ?? null,
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to generate AI suggestion',
        'error' => $e->getMessage()
    ], 500);
}
