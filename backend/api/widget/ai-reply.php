<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/ai-reply.php
// هدف: پاسخ خودکار AI در ویجت، فقط در حالت نبود پشتیبان آنلاین

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-answer-engine.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/subscription.php';
require_once __DIR__ . '/../../includes/hosted-support.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$input = get_json_input();

$siteKey = trim((string) ($input['site_key'] ?? ''));
$visitorId = isset($input['visitor_id']) ? (int) $input['visitor_id'] : 0;
$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;

if ($siteKey === '' || $visitorId <= 0 || $conversationId <= 0 || $messageId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_key, visitor_id, conversation_id and message_id are required'
    ], 422);
}

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response([
        'success' => false,
        'message' => 'Invalid site_key'
    ], 422);
}

enforce_rate_limit(
    $pdo,
    'widget_ai_reply',
    rate_limit_identifier($siteKey . '|' . $visitorId . '|' . $conversationId),
    12,
    5 * 60,
    'Too many AI reply requests. Please slow down.'
);

try {
    $conversationStmt = $pdo->prepare("
        SELECT
            conversations.id AS conversation_id,
            conversations.site_id,
            conversations.visitor_id,
            conversations.status AS conversation_status,
            sites.id AS site_id,
            sites.tenant_id,
            sites.domain,
            sites.site_key,
            sites.ai_mode,
            sites.is_active,
            tenants.status AS tenant_status
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

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    require_active_subscription($pdo, (int) $conversation['tenant_id'], 'ai_auto_reply');

    validate_widget_origin_or_fail($conversation['domain']);

    if ($conversation['conversation_status'] === 'closed') {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'conversation_closed'
        ]);
    }

    if ($conversation['ai_mode'] !== 'semi_auto') {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => $conversation['ai_mode'] === 'off'
                ? 'site_ai_mode_off'
                : 'site_ai_mode_assistant_only'
        ]);
    }
    $plan = get_tenant_plan_limits(
        $pdo,
        (int) $conversation['tenant_id'],
        false
    );

    if ($plan['plan_id'] === null) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'plan_not_assigned',
        ]);
    }

    if (!$plan['plan_is_active']) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'plan_inactive',
        ]);
    }

    if (!$plan['ai_auto_reply_enabled']) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'plan_auto_reply_disabled',
        ]);
    }


    $messageStmt = $pdo->prepare("
        SELECT id, content
        FROM messages
        WHERE id = :message_id
          AND conversation_id = :conversation_id
          AND sender_type = 'visitor'
        LIMIT 1
    ");

    $messageStmt->execute([
        ':message_id' => $messageId,
        ':conversation_id' => $conversationId,
    ]);

    $visitorMessage = $messageStmt->fetch();

    if (!$visitorMessage) {
        json_response([
            'success' => false,
            'message' => 'Visitor message not found'
        ], 404);
    }

    $duplicateStmt = $pdo->prepare("
        SELECT id
        FROM ai_answer_logs
        WHERE site_id = :site_id
          AND conversation_id = :conversation_id
          AND message_id = :message_id
          AND reply_mode IN ('auto_reply', 'fallback')
        LIMIT 1
    ");

    $duplicateStmt->execute([
        ':site_id' => (int) $conversation['site_id'],
        ':conversation_id' => $conversationId,
        ':message_id' => $messageId,
    ]);

    if ($duplicateStmt->fetch()) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'already_replied'
        ]);
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
        ':site_id' => (int) $conversation['site_id'],
    ]);

    $settings = $settingsStmt->fetch();

    if (!$settings || (int) $settings['assistant_enabled'] !== 1) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'assistant_disabled'
        ]);
    }

    if ((int) $settings['auto_reply_enabled'] !== 1) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'auto_reply_disabled'
        ]);
    }

    $hostedPageStmt = $pdo->prepare("
        SELECT timezone
        FROM hosted_support_pages
        WHERE site_id = :site_id
        LIMIT 1
    ");
    $hostedPageStmt->execute([
        ':site_id' => (int) $conversation['site_id'],
    ]);
    $hostedPage = $hostedPageStmt->fetch();

    $supportStatus = hosted_support_compute_status(
        $pdo,
        (int) $conversation['site_id'],
        $hostedPage['timezone'] ?? 'Asia/Tehran'
    );

    if ($supportStatus['support_online']) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'support_online'
        ]);
    }

    if (
        !$supportStatus['is_within_business_hours']
        && !$supportStatus['offline']['ai_after_hours_enabled']
    ) {
        json_response([
            'success' => true,
            'skipped' => true,
            'reason' => 'after_hours_ai_disabled'
        ]);
    }

    $site = [
        'id' => (int) $conversation['site_id'],
        'tenant_id' => (int) $conversation['tenant_id'],
        'domain' => $conversation['domain'],
        'site_key' => $conversation['site_key'],
    ];

    $question = trim((string) $visitorMessage['content']);

    $result = ai_find_best_answer($pdo, $site, $question);

    $minAutoReplyScore = (float) $settings['min_auto_reply_score'];
    $fallbackMessage = !empty($settings['fallback_message'])
        ? $settings['fallback_message']
        : 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد تا در اولین فرصت پاسخ بدهند.';

    $hasGoodAnswer = $result['success'] && ((float) $result['confidence_score'] >= $minAutoReplyScore);

    $replyText = $hasGoodAnswer ? $result['answer'] : $fallbackMessage;
    $replyMode = $hasGoodAnswer ? 'auto_reply' : 'fallback';
    $failureReason = ai_failure_reason($result, $minAutoReplyScore);

    $pdo->beginTransaction();

    if (!$hasGoodAnswer) {
        ai_record_unanswered_question($pdo, [
            'tenant_id' => (int) $conversation['tenant_id'],
            'site_id' => (int) $conversation['site_id'],
            'conversation_id' => $conversationId,
            'message_id' => $messageId,
            'question' => $question,
            'detected_category' => $result['detected']['category'] ?? null,
            'detected_intent' => $result['detected']['intent'] ?? null,
            'best_match_score' => $result['confidence_score'] ?? 0,
            'best_sources' => $result['sources'] ?? [],
            'failure_reason' => $failureReason,
        ]);
    }

    $aiMessageStmt = $pdo->prepare("
        INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_id,
            content,
            is_read
        ) VALUES (
            :conversation_id,
            'ai',
            NULL,
            :content,
            0
        )
    ");

    $aiMessageStmt->execute([
        ':conversation_id' => $conversationId,
        ':content' => $replyText,
    ]);

    $aiMessageId = (int) $pdo->lastInsertId();

    ai_log_answer($pdo, [
        'tenant_id' => (int) $conversation['tenant_id'],
        'site_id' => (int) $conversation['site_id'],
        'conversation_id' => $conversationId,
        'message_id' => $messageId,
        'user_question' => $question,
        'reply_text' => $replyText,
        'confidence_score' => $result['confidence_score'] ?? 0,
        'matched_chunk_id' => $result['matched_chunk_id'] ?? null,
        'matched_question_id' => $result['matched_question_id'] ?? null,
        'sources' => $result['sources'] ?? [],
        'reply_mode' => $replyMode,
        'request_source' => 'widget',
        'failure_reason' => $failureReason,
    ]);

    $updateConversationStmt = $pdo->prepare("
        UPDATE conversations
        SET
            status = CASE
                WHEN status = 'new' THEN 'open'
                ELSE status
            END,
            last_message_at = NOW()
        WHERE id = :conversation_id
    ");

    $updateConversationStmt->execute([
        ':conversation_id' => $conversationId,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'skipped' => false,
        'reply_mode' => $replyMode,
        'answered' => $hasGoodAnswer,
        'confidence_score' => $result['confidence_score'] ?? 0,
        'min_auto_reply_score' => $minAutoReplyScore,
        'ai_message' => [
            'id' => $aiMessageId,
            'conversation_id' => $conversationId,
            'sender_type' => 'ai',
            'sender_id' => null,
            'content' => $replyText,
            'created_at' => date('Y-m-d H:i:s'),
        ],
        'debug' => [
            'tokens' => $result['tokens'] ?? [],
            'detected' => $result['detected'] ?? null,
            'sources' => $result['sources'] ?? [],
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'AI reply failed',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
