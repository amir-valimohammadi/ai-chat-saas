<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-search-test.php
// هدف: تست موتور جستجو بدون واردکردن داده آزمایشی به آمار و صف سوالات واقعی

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-answer-engine.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$input = get_json_input();
$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;
$question = trim((string) ($input['question'] ?? ''));

if ($question === '') {
    json_response([
        'success' => false,
        'message' => 'Question is required'
    ], 422);
}

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);

    require_site_plan_feature(
        $pdo,
        (int) $site['id'],
        'knowledge_base_enabled',
        'Knowledge Base'
    );

    require_site_plan_feature(
        $pdo,
        (int) $site['id'],
        'ai_suggestions_enabled',
        'AI Suggestions'
    );

    $settingsStmt = $pdo->prepare("
        SELECT *
        FROM ai_site_settings
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
        LIMIT 1
    ");

    $settingsStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
    ]);

    $settings = $settingsStmt->fetch();
    $minSuggestionScore = $settings
        ? (float) $settings['min_suggestion_score']
        : 45.00;

    $fallbackMessage = $settings && !empty($settings['fallback_message'])
        ? $settings['fallback_message']
        : 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد.';

    $result = ai_find_best_answer($pdo, $site, $question);
    $confidenceScore = (float) ($result['confidence_score'] ?? 0);
    $hasGoodAnswer = $result['success'] && $confidenceScore >= $minSuggestionScore;
    $failureReason = ai_failure_reason($result, $minSuggestionScore);
    $replyText = $hasGoodAnswer ? $result['answer'] : $fallbackMessage;

    // تست‌های AI Center فقط در لاگ تست ذخیره می‌شوند و وارد صف سوالات بی‌پاسخ نمی‌شوند.
    ai_log_answer($pdo, [
        'tenant_id' => (int) $user['tenant_id'],
        'site_id' => $siteId,
        'user_question' => $question,
        'reply_text' => $replyText,
        'confidence_score' => $confidenceScore,
        'matched_chunk_id' => $result['matched_chunk_id'] ?? null,
        'matched_question_id' => $result['matched_question_id'] ?? null,
        'sources' => $result['sources'] ?? [],
        'reply_mode' => $hasGoodAnswer ? 'suggestion' : 'no_answer',
        'request_source' => 'test',
        'failure_reason' => $failureReason,
    ]);

    json_response([
        'success' => true,
        'answered' => $hasGoodAnswer,
        'reply_mode' => $hasGoodAnswer ? 'suggestion' : 'fallback',
        'request_source' => 'test',
        'failure_reason' => $failureReason,
        'confidence_score' => $confidenceScore,
        'min_suggestion_score' => $minSuggestionScore,
        'answer' => $replyText,
        'sources' => $result['sources'] ?? [],
        'debug' => [
            'engine_version' => $result['search_meta']['engine_version'] ?? ai_search_engine_version(),
            'normalized_question' => $result['normalized_question'] ?? '',
            'tokens' => $result['tokens'] ?? [],
            'expanded_tokens' => $result['expanded_tokens'] ?? [],
            'detected' => $result['detected'] ?? [],
            'matched_type' => $result['matched_type'] ?? null,
            'confidence_label' => $result['confidence_label'] ?? 'low',
            'candidate_count' => $result['search_meta']['candidate_count'] ?? 0,
            'score_gap' => $result['search_meta']['score_gap'] ?? 0,
            'matched_terms' => $result['search_meta']['matched_terms'] ?? [],
            'processing_time_ms' => $result['search_meta']['processing_time_ms'] ?? 0,
            'best_candidates' => $result['best_candidates'] ?? [],
        ]
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'AI search test failed',
        ...safe_api_exception_context($e)
    ], 500);
}
