<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/quick-replies-create.php
// هدف: ساخت پاسخ آماده جدید توسط Customer Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

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
$title = trim($input['title'] ?? '');
$content = trim($input['content'] ?? '');
$category = trim($input['category'] ?? '');

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Site ID is required'
    ], 422);
}

if ($title === '') {
    json_response([
        'success' => false,
        'message' => 'Title is required'
    ], 422);
}

if ($content === '') {
    json_response([
        'success' => false,
        'message' => 'Content is required'
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

    $stmt = $pdo->prepare("
        INSERT INTO quick_replies (
            site_id,
            title,
            content,
            category,
            is_active,
            created_by
        ) VALUES (
            :site_id,
            :title,
            :content,
            :category,
            1,
            :created_by
        )
    ");

    $stmt->execute([
        ':site_id' => $siteId,
        ':title' => $title,
        ':content' => $content,
        ':category' => $category !== '' ? $category : null,
        ':created_by' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Quick reply created successfully',
        'item_id' => (int) $pdo->lastInsertId()
    ], 201);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to create quick reply',
        ...safe_api_exception_context($e)
    ], 500);
}