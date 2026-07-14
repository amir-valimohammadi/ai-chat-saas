<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-search-test.php
// هدف: تست موتور جستجو و پاسخ AI از پنل customer admin

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

    $minSuggestionScore = $settings ? (float) $settings['min_suggestion_score'] : 45.00;
    $fallbackMessage = $settings && !empty($settings['fallback_message'])
        ? $settings['fallback_message']
        : 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد.';

    $result = ai_find_best_answer($pdo, $site, $question);

    if (!$result['success'] || (float) $result['confidence_score'] < $minSuggestionScore) {
        $insertUnanswered = $pdo->prepare("
            INSERT INTO ai_unanswered_questions (
                tenant_id,
                site_id,
                question,
                normalized_question,
                detected_category,
                detected_intent,
                best_match_score,
                best_sources_json,
                status
            ) VALUES (
                :tenant_id,
                :site_id,
                :question,
                :normalized_question,
                :detected_category,
                :detected_intent,
                :best_match_score,
                :best_sources_json,
                'new'
            )
        ");

        $insertUnanswered->execute([
            ':tenant_id' => $user['tenant_id'],
            ':site_id' => $siteId,
            ':question' => $question,
            ':normalized_question' => ai_normalize_text($question),
            ':detected_category' => $result['detected']['category'] ?? null,
            ':detected_intent' => $result['detected']['intent'] ?? null,
            ':best_match_score' => $result['confidence_score'] ?? 0,
            ':best_sources_json' => json_encode($result['sources'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        $logStmt = $pdo->prepare("
            INSERT INTO ai_answer_logs (
                tenant_id,
                site_id,
                user_question,
                normalized_question,
                reply_text,
                confidence_score,
                sources_json,
                reply_mode
            ) VALUES (
                :tenant_id,
                :site_id,
                :user_question,
                :normalized_question,
                :reply_text,
                :confidence_score,
                :sources_json,
                'no_answer'
            )
        ");

        $logStmt->execute([
            ':tenant_id' => $user['tenant_id'],
            ':site_id' => $siteId,
            ':user_question' => $question,
            ':normalized_question' => ai_normalize_text($question),
            ':reply_text' => $fallbackMessage,
            ':confidence_score' => $result['confidence_score'] ?? 0,
            ':sources_json' => json_encode($result['sources'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        json_response([
            'success' => true,
            'answered' => false,
            'reply_mode' => 'fallback',
            'confidence_score' => $result['confidence_score'] ?? 0,
            'min_suggestion_score' => $minSuggestionScore,
            'answer' => $fallbackMessage,
            'debug' => $result
        ]);
    }

    $logStmt = $pdo->prepare("
        INSERT INTO ai_answer_logs (
            tenant_id,
            site_id,
            user_question,
            normalized_question,
            reply_text,
            confidence_score,
            matched_chunk_id,
            matched_question_id,
            sources_json,
            reply_mode
        ) VALUES (
            :tenant_id,
            :site_id,
            :user_question,
            :normalized_question,
            :reply_text,
            :confidence_score,
            :matched_chunk_id,
            :matched_question_id,
            :sources_json,
            'suggestion'
        )
    ");

    $logStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
        ':user_question' => $question,
        ':normalized_question' => ai_normalize_text($question),
        ':reply_text' => $result['answer'],
        ':confidence_score' => $result['confidence_score'],
        ':matched_chunk_id' => $result['matched_chunk_id'],
        ':matched_question_id' => $result['matched_question_id'],
        ':sources_json' => json_encode($result['sources'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);

    json_response([
        'success' => true,
        'answered' => true,
        'reply_mode' => 'suggestion',
        'confidence_score' => $result['confidence_score'],
        'min_suggestion_score' => $minSuggestionScore,
        'answer' => $result['answer'],
        'sources' => $result['sources'],
        'debug' => [
            'tokens' => $result['tokens'],
            'detected' => $result['detected'],
            'matched_type' => $result['matched_type'],
            'best_candidates' => $result['best_candidates'],
        ]
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'AI search test failed',
        'error' => $e->getMessage()
    ], 500);
}