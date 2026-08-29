<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-generated-question-update.php
// هدف: ویرایش یا تغییر وضعیت سوالات دانش AI

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-crawler.php';
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

$id = isset($input['id']) ? (int) $input['id'] : 0;
$question = trim((string) ($input['question'] ?? ''));
$answerText = trim((string) ($input['answer_text'] ?? ''));
$category = trim((string) ($input['category'] ?? ''));
$detectedIntent = trim((string) ($input['detected_intent'] ?? ''));
$status = trim((string) ($input['status'] ?? 'active'));

$allowedStatuses = ['active', 'ignored', 'archived'];

if ($id <= 0) {
    json_response([
        'success' => false,
        'message' => 'Question ID is required'
    ], 422);
}

if ($question === '') {
    json_response([
        'success' => false,
        'message' => 'Question is required'
    ], 422);
}

if ($answerText === '') {
    json_response([
        'success' => false,
        'message' => 'Answer is required'
    ], 422);
}

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status'
    ], 422);
}

if (mb_strlen($question) > 1000) {
    json_response([
        'success' => false,
        'message' => 'Question is too long'
    ], 422);
}

if (mb_strlen($answerText) > 4000) {
    json_response([
        'success' => false,
        'message' => 'Answer is too long'
    ], 422);
}

try {
    $checkStmt = $pdo->prepare("
        SELECT id, tenant_id, site_id, source_type, question, normalized_question, origin_question_hash
        FROM ai_generated_questions
        WHERE id = :id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");

    $checkStmt->execute([
        ':id' => $id,
        ':tenant_id' => $user['tenant_id'],
    ]);

    $existing = $checkStmt->fetch();

    if (!$existing) {
        json_response([
            'success' => false,
            'message' => 'Generated question not found'
        ], 404);
    }
    if ($status !== 'archived') {
        require_site_plan_feature(
            $pdo,
            (int) $existing['site_id'],
            'knowledge_base_enabled',
            'Knowledge Base'
        );
    }
    $existingNormalizedQuestion = ai_normalize_text(
        (string) ($existing['normalized_question'] ?: $existing['question'])
    );
    $originQuestionHash = $existing['origin_question_hash']
        ?: hash('sha256', $existingNormalizedQuestion);

    $stmt = $pdo->prepare("
        UPDATE ai_generated_questions
        SET
            question = :question,
            normalized_question = :normalized_question,
            answer_text = :answer_text,
            category = :category,
            detected_intent = :detected_intent,
            source_type = CASE
                WHEN source_type = 'manual' THEN 'manual'
                ELSE 'edited'
            END,
            origin_question_hash = COALESCE(origin_question_hash, :origin_question_hash),
            is_user_edited = 1,
            preserved_at = COALESCE(preserved_at, NOW()),
            score = CASE
                WHEN score < 90 THEN 90
                ELSE score
            END,
            status = :status
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':question' => $question,
        ':normalized_question' => ai_normalize_text($question),
        ':origin_question_hash' => $originQuestionHash,
        ':answer_text' => $answerText,
        ':category' => $category !== '' ? $category : 'دانش ویرایش‌شده',
        ':detected_intent' => $detectedIntent !== '' ? $detectedIntent : 'edited_answer',
        ':status' => $status,
        ':id' => $id,
        ':tenant_id' => $user['tenant_id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Generated question updated successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update generated question',
        ...safe_api_exception_context($e)
    ], 500);
}