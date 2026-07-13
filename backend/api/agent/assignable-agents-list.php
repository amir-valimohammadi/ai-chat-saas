<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/assignable-agents-list.php
// هدف: دریافت امن لیست پشتیبان‌های قابل اختصاص به یک گفتگو

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
        SELECT
            conversations.id,
            conversations.site_id,
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

    $stmt = $pdo->prepare("
        SELECT DISTINCT
            users.id,
            users.name,
            users.email,
            users.phone,
            users.role,
            users.last_seen_at,
            users.availability_status
        FROM users
        LEFT JOIN agent_site_access
            ON agent_site_access.user_id = users.id
            AND agent_site_access.site_id = :site_id
        WHERE users.tenant_id = :tenant_id
          AND users.is_active = 1
          AND users.role IN ('customer_admin', 'agent')
          AND (
                users.role = 'customer_admin'
                OR agent_site_access.site_id IS NOT NULL
          )
        ORDER BY
            CASE WHEN users.role = 'customer_admin' THEN 0 ELSE 1 END,
            users.name ASC
    ");

    $stmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
    ]);

    $agents = $stmt->fetchAll();

    json_response([
        'success' => true,
        'agents' => array_map(function ($agent) {
            $isOnline = false;

            if (!empty($agent['last_seen_at'])) {
                $lastSeenTimestamp = strtotime($agent['last_seen_at']);
                $isOnline = $lastSeenTimestamp >= strtotime('-2 minutes')
                    && ($agent['availability_status'] ?? 'online') === 'online';
            }

            return [
                'id' => (int) $agent['id'],
                'name' => $agent['name'],
                'email' => $agent['email'],
                'phone' => $agent['phone'],
                'role' => $agent['role'],
                'last_seen_at' => $agent['last_seen_at'],
                'availability_status' => $agent['availability_status'] ?? 'online',
                'is_online' => $isOnline,
            ];
        }, $agents)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load assignable agents',
        'error' => $e->getMessage()
    ], 500);
}