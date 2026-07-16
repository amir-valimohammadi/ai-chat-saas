<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-knowledge-source-update.php
// هدف: ویرایش و تغییر وضعیت رکوردهای knowledge_sources از AI Center

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
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

$type = ai_trim_or_null($input['type'] ?? null);
$title = ai_trim_or_null($input['title'] ?? null);
$question = ai_trim_or_null($input['question'] ?? null);
$answer = ai_trim_or_null($input['answer'] ?? null);
$content = ai_trim_or_null($input['content'] ?? null);
$url = ai_trim_or_null($input['url'] ?? null);
$status = ai_trim_or_null($input['status'] ?? null);

if ($id <= 0) {
    json_response([
        'success' => false,
        'message' => 'id is required'
    ], 422);
}

$allowedStatuses = ['draft', 'approved', 'archived'];

if (!$status || !in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status'
    ], 422);
}

if (!$type) {
    $type = 'faq';
}

if (!$title && !$question) {
    json_response([
        'success' => false,
        'message' => 'title or question is required'
    ], 422);
}

if (!$answer && !$content) {
    json_response([
        'success' => false,
        'message' => 'answer or content is required'
    ], 422);
}

if ($url && !filter_var($url, FILTER_VALIDATE_URL)) {
    json_response([
        'success' => false,
        'message' => 'Invalid url'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        SELECT id, site_id
        FROM knowledge_sources
        WHERE id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $id,
    ]);

    $item = $stmt->fetch();

    if (!$item) {
        json_response([
            'success' => false,
            'message' => 'Knowledge source not found'
        ], 404);
    }

    $site = ai_get_customer_site($pdo, $user, (int) $item['site_id']);
    if ($status !== 'archived') {
        require_site_plan_feature(
            $pdo,
            (int) $item['site_id'],
            'knowledge_base_enabled',
            'Knowledge Base'
        );
    }
    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    $updateStmt = $pdo->prepare("
        UPDATE knowledge_sources
        SET
            type = :type,
            title = :title,
            question = :question,
            answer = :answer,
            content = :content,
            url = :url,
            status = :status,
            updated_at = NOW()
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':type' => $type,
        ':title' => $title,
        ':question' => $question,
        ':answer' => $answer,
        ':content' => $content,
        ':url' => $url,
        ':status' => $status,
        ':id' => $id,
    ]);

    json_response([
        'success' => true,
        'message' => 'Knowledge source updated successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update knowledge source',
        'error' => $e->getMessage()
    ], 500);
}