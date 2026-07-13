<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/tenants-list.php
// هدف: دریافت لیست مشتری‌ها برای Super Admin

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

try {
    $stmt = $pdo->query("
        SELECT
            tenants.id,
            tenants.name,
            tenants.owner_name,
            tenants.owner_email,
            tenants.owner_phone,
            tenants.status,
            tenants.created_at,
            plans.name AS plan_name,

            (
                SELECT COUNT(*)
                FROM sites
                WHERE sites.tenant_id = tenants.id
            ) AS sites_count,

            (
                SELECT COUNT(*)
                FROM users
                WHERE users.tenant_id = tenants.id
            ) AS users_count

        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        ORDER BY tenants.id DESC
    ");

    $tenants = $stmt->fetchAll();

    json_response([
        'success' => true,
        'tenants' => array_map(function ($tenant) {
            return [
                'id' => (int) $tenant['id'],
                'name' => $tenant['name'],
                'owner_name' => $tenant['owner_name'],
                'owner_email' => $tenant['owner_email'],
                'owner_phone' => $tenant['owner_phone'],
                'status' => $tenant['status'],
                'plan_name' => $tenant['plan_name'],
                'sites_count' => (int) $tenant['sites_count'],
                'users_count' => (int) $tenant['users_count'],
                'created_at' => $tenant['created_at'],
            ];
        }, $tenants)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load tenants',
        'error' => $e->getMessage()
    ], 500);
}