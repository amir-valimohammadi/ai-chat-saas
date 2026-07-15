<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-knowledge-source-create.php
// هدف: افزودن دانش دستی جدید به knowledge_sources از داخل AI Center

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/subscription.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
require_active_subscription($pdo, (int) $user['tenant_id'], 'knowledge_create');

$input = get_json_input();

$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;

$type = ai_trim_or_null($input['type'] ?? null);
$title = ai_trim_or_null($input['title'] ?? null);
$question = ai_trim_or_null($input['question'] ?? null);
$answer = ai_trim_or_null($input['answer'] ?? null);
$content = ai_trim_or_null($input['content'] ?? null);
$url = ai_trim_or_null($input['url'] ?? null);
$status = ai_trim_or_null($input['status'] ?? null);

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_id is required'
    ], 422);
}

$allowedStatuses = ['approved', 'active', 'inactive', 'archived'];

if (!$status) {
    $status = 'approved';
}

if (!in_array($status, $allowedStatuses, true)) {
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
    $site = ai_get_customer_site($pdo, $user, $siteId);
    require_site_plan_feature(
        $pdo,
        $siteId,
        'knowledge_base_enabled',
        'Knowledge Base'
    );
    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        INSERT INTO knowledge_sources (
            site_id,
            type,
            title,
            question,
            answer,
            content,
            url,
            status,
            created_by,
            created_at,
            updated_at
        ) VALUES (
            :site_id,
            :type,
            :title,
            :question,
            :answer,
            :content,
            :url,
            :status,
            :created_by,
            NOW(),
            NOW()
        )
    ");

    $stmt->execute([
        ':site_id' => $siteId,
        ':type' => $type,
        ':title' => $title,
        ':question' => $question,
        ':answer' => $answer,
        ':content' => $content,
        ':url' => $url,
        ':status' => $status,
        ':created_by' => (int) $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Knowledge source created successfully',
        'id' => (int) $pdo->lastInsertId(),
    ], 201);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to create knowledge source',
        'error' => $e->getMessage()
    ], 500);
}
