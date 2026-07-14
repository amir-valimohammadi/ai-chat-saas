<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/knowledge-create.php
// هدف: ثبت دانش جدید برای سایت مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
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
$type = trim($input['type'] ?? 'manual_text');
$title = trim($input['title'] ?? '');
$question = trim($input['question'] ?? '');
$answer = trim($input['answer'] ?? '');
$content = trim($input['content'] ?? '');
$url = trim($input['url'] ?? '');
$status = trim($input['status'] ?? 'approved');

$allowedTypes = ['faq', 'manual_text', 'policy', 'web_page', 'product', 'service'];
$allowedStatuses = ['draft', 'approved'];

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Site ID is required'
    ], 422);
}

if (!in_array($type, $allowedTypes, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid knowledge type'
    ], 422);
}

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status'
    ], 422);
}

if ($title === '' && $question === '') {
    json_response([
        'success' => false,
        'message' => 'Title or question is required'
    ], 422);
}

if ($answer === '' && $content === '') {
    json_response([
        'success' => false,
        'message' => 'Answer or content is required'
    ], 422);
}

try {
    $siteStmt = $pdo->prepare("
        SELECT id
        FROM sites
        WHERE id = :site_id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");

    $siteStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    if (!$siteStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }
    require_site_plan_feature(
        $pdo,
        $siteId,
        'knowledge_base_enabled',
        'Knowledge Base'
    );
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
            created_by
        ) VALUES (
            :site_id,
            :type,
            :title,
            :question,
            :answer,
            :content,
            :url,
            :status,
            :created_by
        )
    ");

    $stmt->execute([
        ':site_id' => $siteId,
        ':type' => $type,
        ':title' => $title !== '' ? $title : null,
        ':question' => $question !== '' ? $question : null,
        ':answer' => $answer !== '' ? $answer : null,
        ':content' => $content !== '' ? $content : null,
        ':url' => $url !== '' ? $url : null,
        ':status' => $status,
        ':created_by' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Knowledge item created successfully',
        'item_id' => (int) $pdo->lastInsertId()
    ], 201);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to create knowledge item',
        'error' => $e->getMessage()
    ], 500);
}