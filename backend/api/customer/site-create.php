<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/site-create.php
// هدف: افزودن سایت جدید توسط Customer Admin با کنترل واقعی max_sites

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/subscription.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$input = get_json_input();

$name = trim((string) ($input['name'] ?? ''));
$domain = trim((string) ($input['domain'] ?? ''));
$brandName = trim((string) ($input['brand_name'] ?? ''));
$brandColor = trim((string) ($input['brand_color'] ?? '#2563eb'));
$welcomeMessage = trim((string) (
    $input['welcome_message']
    ?? 'سلام، چطور می‌تونیم کمکتون کنیم؟'
));
$aiMode = trim((string) ($input['ai_mode'] ?? 'assistant'));

if ($name === '' || mb_strlen($name, 'UTF-8') > 255) {
    json_response([
        'success' => false,
        'message' => 'Site name is required and must not exceed 255 characters',
    ], 422);
}

if (
    $domain === ''
    || mb_strlen($domain, 'UTF-8') > 255
    || preg_match('/[\r\n\s]/', $domain)
) {
    json_response([
        'success' => false,
        'message' => 'Domain is invalid',
    ], 422);
}

if (!preg_match('/^#[0-9a-fA-F]{6}$/', $brandColor)) {
    json_response([
        'success' => false,
        'message' => 'Brand color must be a valid HEX color',
    ], 422);
}

if (mb_strlen($welcomeMessage, 'UTF-8') > 300) {
    json_response([
        'success' => false,
        'message' => 'Welcome message must not exceed 300 characters',
    ], 422);
}

if (!in_array($aiMode, ['off', 'assistant', 'semi_auto'], true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid AI mode',
    ], 422);
}

$tenantId = (int) $user['tenant_id'];
require_active_subscription($pdo, $tenantId, 'site_create');

try {
    $pdo->beginTransaction();

    ensure_site_limit($pdo, $tenantId, true);

    $domainStmt = $pdo->prepare("
        SELECT id
        FROM sites
        WHERE domain = :domain
        LIMIT 1
        FOR UPDATE
    ");

    $domainStmt->execute([
        ':domain' => $domain,
    ]);

    if ($domainStmt->fetch()) {
        $pdo->rollBack();

        json_response([
            'success' => false,
            'message' => 'A site with this domain already exists',
        ], 409);
    }

    $siteKey = random_site_key();

    $siteStmt = $pdo->prepare("
        INSERT INTO sites (
            tenant_id,
            name,
            domain,
            site_key,
            brand_name,
            brand_color,
            welcome_message,
            ai_mode,
            is_active
        ) VALUES (
            :tenant_id,
            :name,
            :domain,
            :site_key,
            :brand_name,
            :brand_color,
            :welcome_message,
            :ai_mode,
            1
        )
    ");

    $siteStmt->execute([
        ':tenant_id' => $tenantId,
        ':name' => $name,
        ':domain' => $domain,
        ':site_key' => $siteKey,
        ':brand_name' => $brandName !== '' ? $brandName : $name,
        ':brand_color' => strtolower($brandColor),
        ':welcome_message' => $welcomeMessage,
        ':ai_mode' => $aiMode,
    ]);

    $siteId = (int) $pdo->lastInsertId();

    $adminsStmt = $pdo->prepare("
        SELECT id
        FROM users
        WHERE tenant_id = :tenant_id
          AND role = 'customer_admin'
          AND is_active = 1
    ");

    $adminsStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $accessStmt = $pdo->prepare("
        INSERT INTO agent_site_access (user_id, site_id)
        VALUES (:user_id, :site_id)
    ");

    foreach ($adminsStmt->fetchAll() as $admin) {
        $accessStmt->execute([
            ':user_id' => (int) $admin['id'],
            ':site_id' => $siteId,
        ]);
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Site created successfully',
        'site' => [
            'id' => $siteId,
            'tenant_id' => $tenantId,
            'name' => $name,
            'domain' => $domain,
            'site_key' => $siteKey,
            'brand_name' => $brandName !== '' ? $brandName : $name,
            'brand_color' => strtolower($brandColor),
            'welcome_message' => $welcomeMessage,
            'ai_mode' => $aiMode,
            'is_active' => true,
        ],
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'Failed to create site',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
