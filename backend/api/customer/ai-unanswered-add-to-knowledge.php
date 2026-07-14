<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-unanswered-add-to-knowledge.php
// هدف: تبدیل سوال بی‌پاسخ به دانش دستی AI

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
$questionInput = trim((string) ($input['question'] ?? ''));
$answer = trim((string) ($input['answer'] ?? ''));

if ($id <= 0) {
    json_response([
        'success' => false,
        'message' => 'Unanswered question ID is required'
    ], 422);
}

if ($answer === '') {
    json_response([
        'success' => false,
        'message' => 'Answer is required'
    ], 422);
}

if (mb_strlen($answer) < 5) {
    json_response([
        'success' => false,
        'message' => 'Answer is too short'
    ], 422);
}

if (mb_strlen($answer) > 4000) {
    json_response([
        'success' => false,
        'message' => 'Answer is too long'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        SELECT
            id,
            tenant_id,
            site_id,
            question,
            detected_category,
            detected_intent,
            status
        FROM ai_unanswered_questions
        WHERE id = :id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $id,
        ':tenant_id' => $user['tenant_id'],
    ]);

    $unanswered = $stmt->fetch();

    if (!$unanswered) {
        json_response([
            'success' => false,
            'message' => 'Unanswered question not found'
        ], 404);
    }

    $question = $questionInput !== '' ? $questionInput : trim((string) $unanswered['question']);

    if ($question === '') {
        json_response([
            'success' => false,
            'message' => 'Question is required'
        ], 422);
    }

    if (mb_strlen($question) > 1000) {
        json_response([
            'success' => false,
            'message' => 'Question is too long'
        ], 422);
    }

    $tenantId = (int) $unanswered['tenant_id'];
    $siteId = (int) $unanswered['site_id'];
    require_site_plan_feature(
        $pdo,
        $siteId,
        'knowledge_base_enabled',
        'Knowledge Base'
    );
    $normalizedQuestion = ai_normalize_text($question);

    $pdo->beginTransaction();

    $existingStmt = $pdo->prepare("
        SELECT id
        FROM ai_generated_questions
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
          AND normalized_question = :normalized_question
        LIMIT 1
    ");

    $existingStmt->execute([
        ':tenant_id' => $tenantId,
        ':site_id' => $siteId,
        ':normalized_question' => $normalizedQuestion,
    ]);

    $existing = $existingStmt->fetch();

    if ($existing) {
        $questionId = (int) $existing['id'];

        $updateQuestionStmt = $pdo->prepare("
            UPDATE ai_generated_questions
            SET
                question = :question,
                answer_text = :answer_text,
                category = :category,
                detected_intent = :detected_intent,
                source_type = 'manual',
                score = 95,
                status = 'active'
            WHERE id = :id
              AND tenant_id = :tenant_id
        ");

        $updateQuestionStmt->execute([
            ':question' => $question,
            ':answer_text' => $answer,
            ':category' => $unanswered['detected_category'] ?: 'دانش دستی',
            ':detected_intent' => $unanswered['detected_intent'] ?: 'manual_answer',
            ':id' => $questionId,
            ':tenant_id' => $tenantId,
        ]);
    } else {
        $insertQuestionStmt = $pdo->prepare("
            INSERT INTO ai_generated_questions (
                tenant_id,
                site_id,
                page_id,
                chunk_id,
                question,
                normalized_question,
                answer_text,
                category,
                detected_intent,
                source_type,
                score,
                status
            ) VALUES (
                :tenant_id,
                :site_id,
                NULL,
                NULL,
                :question,
                :normalized_question,
                :answer_text,
                :category,
                :detected_intent,
                'manual',
                95,
                'active'
            )
        ");

        $insertQuestionStmt->execute([
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
            ':question' => $question,
            ':normalized_question' => $normalizedQuestion,
            ':answer_text' => $answer,
            ':category' => $unanswered['detected_category'] ?: 'دانش دستی',
            ':detected_intent' => $unanswered['detected_intent'] ?: 'manual_answer',
        ]);

        $questionId = (int) $pdo->lastInsertId();
    }

    $updateUnansweredStmt = $pdo->prepare("
        UPDATE ai_unanswered_questions
        SET status = 'added_to_knowledge'
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");

    $updateUnansweredStmt->execute([
        ':id' => $id,
        ':tenant_id' => $tenantId,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Question added to AI knowledge successfully',
        'generated_question_id' => $questionId
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to add unanswered question to knowledge',
        'error' => $e->getMessage()
    ], 500);
}