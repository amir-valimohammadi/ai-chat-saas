<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/conversation-assign.php
// هدف: اختصاص امن گفتگو به یک پشتیبان یا حذف اختصاص

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
$agentId = isset($input['agent_id']) && $input['agent_id'] !== null
    ? (int) $input['agent_id']
    : null;

if ($conversationId <= 0) {
    json_response([
        'success' => false,
        'message' => 'conversation_id is required'
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

    $siteId = (int) $conversation['site_id'];

    require_site_access($pdo, $user, $siteId);

    if ($conversation['status'] === 'closed') {
        json_response([
            'success' => false,
            'message' => 'Closed conversations cannot be reassigned'
        ], 422);
    }

    if ($agentId !== null && $agentId > 0) {
        $agentStmt = $pdo->prepare("
            SELECT
                users.id,
                users.role
            FROM users
            LEFT JOIN agent_site_access
                ON agent_site_access.user_id = users.id
                AND agent_site_access.site_id = :site_id
            WHERE users.id = :agent_id
              AND users.tenant_id = :tenant_id
              AND users.is_active = 1
              AND users.role IN ('customer_admin', 'agent')
              AND (
                    users.role = 'customer_admin'
                    OR agent_site_access.site_id IS NOT NULL
              )
            LIMIT 1
        ");

        $agentStmt->execute([
            ':agent_id' => $agentId,
            ':tenant_id' => $user['tenant_id'],
            ':site_id' => $siteId,
        ]);

        if (!$agentStmt->fetch()) {
            json_response([
                'success' => false,
                'message' => 'Selected agent is not available for this conversation'
            ], 404);
        }
    } else {
        $agentId = null;
    }

    $stmt = $pdo->prepare("
        UPDATE conversations
        SET
            assigned_agent_id = :assigned_agent_id,
            status = CASE
                WHEN status = 'new' AND :assigned_agent_id IS NOT NULL THEN 'in_progress'
                ELSE status
            END
        WHERE id = :conversation_id
    ");

    $stmt->execute([
        ':assigned_agent_id' => $agentId,
        ':conversation_id' => $conversationId,
    ]);

    json_response([
        'success' => true,
        'message' => $agentId ? 'Conversation assigned successfully' : 'Conversation unassigned successfully',
        'assigned_agent_id' => $agentId,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to assign conversation',
        'error' => $e->getMessage()
    ], 500);
}