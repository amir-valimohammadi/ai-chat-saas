<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/sites-list.php
// هدف: دریافت سایت‌های مربوط به مشتری لاگین‌شده

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

require_role($user, ['customer_admin', 'agent']);

try {
    if ($user['role'] === 'customer_admin') {
        $stmt = $pdo->prepare("
            SELECT
                id,
                tenant_id,
                name,
                domain,
                site_key,
                brand_name,
                brand_color,
                logo_url,
                welcome_message,
                ai_mode,
                is_active,
                created_at
            FROM sites
            WHERE tenant_id = :tenant_id
            ORDER BY id DESC
        ");

        $stmt->execute([
            ':tenant_id' => $user['tenant_id']
        ]);
    } else {
        $stmt = $pdo->prepare("
            SELECT
                sites.id,
                sites.tenant_id,
                sites.name,
                sites.domain,
                sites.site_key,
                sites.brand_name,
                sites.brand_color,
                sites.logo_url,
                sites.welcome_message,
                sites.ai_mode,
                sites.is_active,
                sites.created_at
            FROM sites
            INNER JOIN agent_site_access ON agent_site_access.site_id = sites.id
            WHERE agent_site_access.user_id = :user_id
              AND sites.tenant_id = :tenant_id
            ORDER BY sites.id DESC
        ");

        $stmt->execute([
            ':user_id' => $user['id'],
            ':tenant_id' => $user['tenant_id']
        ]);
    }

    $sites = $stmt->fetchAll();

    json_response([
        'success' => true,
        'sites' => array_map(function ($site) {
            $installCode = '<script src="https://yourdomain.com/widget.js" data-site-key="' . htmlspecialchars($site['site_key'], ENT_QUOTES, 'UTF-8') . '"></script>';

            return [
                'id' => (int) $site['id'],
                'tenant_id' => (int) $site['tenant_id'],
                'name' => $site['name'],
                'domain' => $site['domain'],
                'site_key' => $site['site_key'],
                'brand_name' => $site['brand_name'],
                'brand_color' => $site['brand_color'],
                'logo_url' => $site['logo_url'],
                'welcome_message' => $site['welcome_message'],
                'ai_mode' => $site['ai_mode'],
                'is_active' => (bool) $site['is_active'],
                'install_code' => $installCode,
                'created_at' => $site['created_at'],
            ];
        }, $sites)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load customer sites',
        'error' => $e->getMessage()
    ], 500);
}