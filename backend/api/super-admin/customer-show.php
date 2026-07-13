<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-show.php
// هدف: نمایش جزئیات کامل یک مشتری برای Super Admin

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
require_role($user, ['super_admin']);

$tenantId = isset($_GET['tenant_id']) ? (int) $_GET['tenant_id'] : 0;

if ($tenantId <= 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_id is required'
    ], 422);
}

try {
    $tenantStmt = $pdo->prepare("
        SELECT
            tenants.id,
            tenants.name,
            tenants.owner_name,
            tenants.owner_email,
            tenants.owner_phone,
            tenants.status,
            tenants.plan_id,
            plans.name AS plan_name,
            tenants.created_at
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        WHERE tenants.id = :tenant_id
        LIMIT 1
    ");

    $tenantStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $tenant = $tenantStmt->fetch();

    if (!$tenant) {
        json_response([
            'success' => false,
            'message' => 'Customer not found'
        ], 404);
    }

    $sitesStmt = $pdo->prepare("
        SELECT
            sites.id,
            sites.name,
            sites.domain,
            sites.site_key,
            sites.brand_name,
            sites.brand_color,
            sites.logo_url,
            sites.welcome_message,
            sites.ai_mode,
            sites.is_active,
            sites.created_at,
            (
                SELECT COUNT(*)
                FROM conversations
                WHERE conversations.site_id = sites.id
            ) AS conversations_count
        FROM sites
        WHERE sites.tenant_id = :tenant_id
        ORDER BY sites.id DESC
    ");

    $sitesStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $sites = $sitesStmt->fetchAll();

    $usersStmt = $pdo->prepare("
        SELECT
            id,
            name,
            email,
            phone,
            role,
            is_active,
            last_login_at,
            last_seen_at,
            availability_status,
            created_at
        FROM users
        WHERE tenant_id = :tenant_id
        ORDER BY id DESC
    ");

    $usersStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $users = $usersStmt->fetchAll();

    $metricsStmt = $pdo->prepare("
        SELECT
            COUNT(DISTINCT conversations.id) AS conversations_count,
            COUNT(DISTINCT messages.id) AS messages_count,
            COUNT(DISTINCT message_attachments.id) AS attachments_count,
            SUM(CASE WHEN conversations.status IN ('new', 'open', 'pending') THEN 1 ELSE 0 END) AS active_conversations,
            SUM(CASE WHEN conversations.status = 'closed' THEN 1 ELSE 0 END) AS closed_conversations
        FROM sites
        LEFT JOIN conversations ON conversations.site_id = sites.id
        LEFT JOIN messages ON messages.conversation_id = conversations.id
        LEFT JOIN message_attachments ON message_attachments.message_id = messages.id
        WHERE sites.tenant_id = :tenant_id
    ");

    $metricsStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $metrics = $metricsStmt->fetch();

    $plansStmt = $pdo->prepare("
        SELECT
            id,
            name,
            price_monthly,
            is_active
        FROM plans
        ORDER BY price_monthly ASC, id ASC
    ");

    $plansStmt->execute();
    $plans = $plansStmt->fetchAll();

    json_response([
        'success' => true,
        'tenant' => [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'owner_name' => $tenant['owner_name'],
            'owner_email' => $tenant['owner_email'],
            'owner_phone' => $tenant['owner_phone'],
            'status' => $tenant['status'],
            'plan_id' => $tenant['plan_id'] !== null ? (int) $tenant['plan_id'] : null,
            'plan_name' => $tenant['plan_name'],
            'created_at' => $tenant['created_at'],
        ],
        'metrics' => [
            'sites_count' => count($sites),
            'users_count' => count($users),
            'conversations_count' => (int) ($metrics['conversations_count'] ?? 0),
            'messages_count' => (int) ($metrics['messages_count'] ?? 0),
            'attachments_count' => (int) ($metrics['attachments_count'] ?? 0),
            'active_conversations' => (int) ($metrics['active_conversations'] ?? 0),
            'closed_conversations' => (int) ($metrics['closed_conversations'] ?? 0),
        ],
        'sites' => array_map(function ($site) {
            return [
                'id' => (int) $site['id'],
                'name' => $site['name'],
                'domain' => $site['domain'],
                'site_key' => $site['site_key'],
                'brand_name' => $site['brand_name'],
                'brand_color' => $site['brand_color'],
                'logo_url' => $site['logo_url'],
                'welcome_message' => $site['welcome_message'],
                'ai_mode' => $site['ai_mode'],
                'is_active' => (bool) $site['is_active'],
                'conversations_count' => (int) $site['conversations_count'],
                'created_at' => $site['created_at'],
            ];
        }, $sites),
        'users' => array_map(function ($user) {
            return [
                'id' => (int) $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'phone' => $user['phone'],
                'role' => $user['role'],
                'is_active' => (bool) $user['is_active'],
                'last_login_at' => $user['last_login_at'],
                'last_seen_at' => $user['last_seen_at'],
                'availability_status' => $user['availability_status'] ?? 'online',
                'created_at' => $user['created_at'],
            ];
        }, $users),
        'plans' => array_map(function ($plan) {
            return [
                'id' => (int) $plan['id'],
                'name' => $plan['name'],
                'price_monthly' => (float) $plan['price_monthly'],
                'is_active' => (bool) $plan['is_active'],
            ];
        }, $plans),
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load customer details',
        'error' => $e->getMessage()
    ], 500);
}