<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/sites-list.php
// هدف: دریافت لیست سایت‌های ثبت‌شده برای Super Admin

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
            sites.id,
            sites.tenant_id,
            tenants.name AS tenant_name,
            sites.name,
            sites.domain,
            sites.site_key,
            sites.brand_name,
            sites.brand_color,
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
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        ORDER BY sites.id DESC
    ");

    $sites = $stmt->fetchAll();

    json_response([
        'success' => true,
        'sites' => array_map(function ($site) {
            return [
                'id' => (int) $site['id'],
                'tenant_id' => (int) $site['tenant_id'],
                'tenant_name' => $site['tenant_name'],
                'name' => $site['name'],
                'domain' => $site['domain'],
                'site_key' => $site['site_key'],
                'brand_name' => $site['brand_name'],
                'brand_color' => $site['brand_color'],
                'welcome_message' => $site['welcome_message'],
                'ai_mode' => $site['ai_mode'],
                'is_active' => (bool) $site['is_active'],
                'conversations_count' => (int) $site['conversations_count'],
                'created_at' => $site['created_at'],
            ];
        }, $sites)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load sites',
        'error' => $e->getMessage()
    ], 500);
}