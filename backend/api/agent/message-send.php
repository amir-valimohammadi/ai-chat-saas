<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/message-send.php
// هدف: ارسال امن پاسخ پشتیبان به یک گفتگو

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
$content = trim($input['content'] ?? '');

if ($conversationId <= 0 || $content === '') {
    json_response([
        'success' => false,
        'message' => 'conversation_id and content are required'
    ], 422);
}

if (mb_strlen($content, 'UTF-8') > 5000) {
    json_response([
        'success' => false,
        'message' => 'Message is too long'
    ], 422);
}

try {
    $conversationStmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.site_id,
            conversations.status,
            conversations.assigned_agent_id,
            sites.tenant_id AS site_tenant_id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE conversations.id = :id
          AND sites.is_active = 1
          AND tenants.status = 'active'
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

    // جلوگیری از IDOR:
    // حتی اگر کاربر conversation_id را دستی عوض کند، باید به site مربوطه دسترسی داشته باشد.
    require_site_access($pdo, $user, (int) $conversation['site_id']);

    if ($conversation['status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'This conversation is closed'
        ], 422);
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_id,
            content,
            is_read
        ) VALUES (
            :conversation_id,
            'agent',
            :sender_id,
            :content,
            0
        )
    ");

    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':sender_id' => $user['id'],
        ':content' => $content,
    ]);

    $messageId = (int) $pdo->lastInsertId();

    $updateStmt = $pdo->prepare("
        UPDATE conversations
        SET
            status = CASE
                WHEN status = 'new' THEN 'open'
                ELSE status
            END,
            assigned_agent_id = COALESCE(assigned_agent_id, :agent_id),
            last_message_at = NOW()
        WHERE id = :id
    ");

    $updateStmt->execute([
        ':agent_id' => $user['id'],
        ':id' => $conversationId,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Reply sent successfully',
        'data' => [
            'id' => $messageId,
            'conversation_id' => $conversationId,
            'sender_type' => 'agent',
            'sender_id' => (int) $user['id'],
            'sender_name' => $user['name'],
            'content' => $content,
            'created_at' => date('Y-m-d H:i:s'),
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to send reply',
        'error' => $e->getMessage()
    ], 500);
}