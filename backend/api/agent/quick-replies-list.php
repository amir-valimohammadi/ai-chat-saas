<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/quick-replies-list.php
// هدف: دریافت پاسخ‌های آماده سایت مربوط به یک گفتگو

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT id, site_id
        FROM conversations
        WHERE id = :id
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':id' => $conversationId
    ]);

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    $siteId = (int) $conversation['site_id'];

    require_site_access($pdo, $user, $siteId);

    $stmt = $pdo->prepare("
        SELECT
            id,
            site_id,
            title,
            content,
            category,
            created_at
        FROM quick_replies
        WHERE site_id = :site_id
          AND is_active = 1
        ORDER BY id DESC
    ");

    $stmt->execute([
        ':site_id' => $siteId
    ]);

    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'items' => array_map(function ($item) {
            return [
                'id' => (int) $item['id'],
                'site_id' => (int) $item['site_id'],
                'title' => $item['title'],
                'content' => $item['content'],
                'category' => $item['category'],
                'created_at' => $item['created_at'],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load quick replies',
        'error' => $e->getMessage()
    ], 500);
}