<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/conversation-status-update.php
// هدف: تغییر امن وضعیت پیشرفته گفتگو

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$input = get_json_input();

$conversationId = isset($input['conversation_id']) ? (int) $input['conversation_id'] : 0;
$status = trim($input['status'] ?? '');

$allowedStatuses = [
    'new',
    'open',
    'in_progress',
    'waiting_customer',
    'follow_up',
    'pending',
    'closed',
];

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
    ], 422);
}

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid conversation status'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.status,
            sites.tenant_id AS site_tenant_id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE conversations.id = :conversation_id
          AND sites.is_active = 1
          AND tenants.status = 'active'
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':conversation_id' => $conversationId,
    ]);

    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        json_response([
            'success' => false,
            'message' => 'Conversation not found'
        ], 404);
    }

    require_site_access($pdo, $user, (int) $conversation['site_id']);

    $stmt = $pdo->prepare("
        UPDATE conversations
        SET
            status = :status,
            closed_at = CASE
                WHEN :status = 'closed' THEN NOW()
                ELSE NULL
            END
        WHERE id = :conversation_id
    ");

    $stmt->execute([
        ':status' => $status,
        ':conversation_id' => $conversationId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Conversation status updated successfully',
        'status' => $status,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update conversation status',
        'error' => $e->getMessage()
    ], 500);
}