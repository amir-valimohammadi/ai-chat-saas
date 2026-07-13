<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/config.php
// هدف: دریافت تنظیمات ویجت با site_key + کنترل Origin + محدودسازی درخواست‌ها

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$siteKey = trim($_GET['site_key'] ?? '');

if ($siteKey === '') {
    json_response([
        'success' => false,
        'message' => 'site_key is required'
    ], 422);
}

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response([
        'success' => false,
        'message' => 'Invalid site_key'
    ], 422);
}

enforce_rate_limit(
    $pdo,
    'widget_config',
    rate_limit_identifier($siteKey . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    120,
    60,
    'Too many requests. Please slow down.'
);

try {
    $stmt = $pdo->prepare("
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
            tenants.status AS tenant_status
        FROM sites
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE sites.site_key = :site_key
        LIMIT 1
    ");

    $stmt->execute([
        ':site_key' => $siteKey
    ]);

    $site = $stmt->fetch();

    if (!$site || (int) $site['is_active'] !== 1 || $site['tenant_status'] !== 'active') {
        json_response([
            'success' => false,
            'message' => 'Widget is not available'
        ], 404);
    }

    validate_widget_origin_or_fail($site['domain']);

    $onlineStmt = $pdo->prepare("
        SELECT COUNT(*) AS online_count
        FROM users
        INNER JOIN sites ON sites.tenant_id = users.tenant_id
        WHERE sites.id = :site_id
          AND users.is_active = 1
          AND users.role IN ('customer_admin', 'agent')
          AND users.availability_status = 'online'
          AND users.last_seen_at IS NOT NULL
          AND users.last_seen_at >= (NOW() - INTERVAL 2 MINUTE)
    ");

    $onlineStmt->execute([
        ':site_id' => (int) $site['id'],
    ]);

    $onlineData = $onlineStmt->fetch();
    $isSupportOnline = ((int) ($onlineData['online_count'] ?? 0)) > 0;

    json_response([
        'success' => true,
        'site' => [
            'name' => $site['name'],
            'brand_name' => $site['brand_name'],
            'brand_color' => $site['brand_color'],
            'logo_url' => $site['logo_url'],
            'welcome_message' => $site['welcome_message'] ?: 'سلام، چطور می‌تونیم کمکتون کنیم؟',
            'ai_mode' => $site['ai_mode'],
            'support_online' => $isSupportOnline,
            'support_status_text' => $isSupportOnline
                ? 'پشتیبانی آنلاین است'
                : 'پشتیبانی در حال حاضر آنلاین نیست؛ ممکن است پاسخ کمی زمان ببرد.',
        ]
    ]);
} catch (Exception $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to load widget config',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}