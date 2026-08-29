<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/team-list.php
// هدف: دریافت لیست اعضای تیم مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
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

try {
    $stmt = $pdo->prepare("
        SELECT
            users.id,
            users.name,
            users.email,
            users.phone,
            users.role,
            users.is_active,
            users.last_login_at,
            users.created_at,
            GROUP_CONCAT(sites.id ORDER BY sites.id ASC) AS site_ids,
            GROUP_CONCAT(sites.name ORDER BY sites.id ASC SEPARATOR ', ') AS site_names
        FROM users
        LEFT JOIN agent_site_access ON agent_site_access.user_id = users.id
        LEFT JOIN sites ON sites.id = agent_site_access.site_id
        WHERE users.tenant_id = :tenant_id
        GROUP BY users.id
        ORDER BY users.id DESC
    ");

    $stmt->execute([
        ':tenant_id' => $user['tenant_id']
    ]);

    $members = $stmt->fetchAll();

    json_response([
        'success' => true,
        'members' => array_map(function ($member) {
            return [
                'id' => (int) $member['id'],
                'name' => $member['name'],
                'email' => $member['email'],
                'phone' => $member['phone'],
                'role' => $member['role'],
                'is_active' => (bool) $member['is_active'],
                'last_login_at' => $member['last_login_at'],
                'created_at' => $member['created_at'],
                'site_ids' => $member['site_ids'] ? array_map('intval', explode(',', $member['site_ids'])) : [],
                'site_names' => $member['site_names'] ? explode(', ', $member['site_names']) : [],
            ];
        }, $members)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load team members',
        ...safe_api_exception_context($e)
    ], 500);
}