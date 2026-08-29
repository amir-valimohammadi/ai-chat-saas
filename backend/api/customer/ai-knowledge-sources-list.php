<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-knowledge-sources-list.php
// هدف: نمایش knowledge_sources داخل AI Center

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;
$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_id is required'
    ], 422);
}

if ($limit < 1) {
    $limit = 50;
}

if ($limit > 200) {
    $limit = 200;
}

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);

    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        SELECT
            id,
            site_id,
            type,
            title,
            question,
            answer,
            content,
            url,
            status,
            created_at,
            updated_at
        FROM knowledge_sources
        WHERE site_id = :site_id
        ORDER BY id DESC
        LIMIT {$limit}
    ");

    $stmt->execute([
        ':site_id' => $siteId,
    ]);

    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'items' => $items,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load knowledge sources',
        ...safe_api_exception_context($e)
    ], 500);
}