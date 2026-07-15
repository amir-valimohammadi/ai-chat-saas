<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-create.php
// هدف: ایجاد مشتری جدید + سایت + حساب مدیر مشتری توسط Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$input = get_json_input();

$tenantName = trim($input['tenant_name'] ?? '');
$ownerName = trim($input['owner_name'] ?? '');
$ownerEmail = trim($input['owner_email'] ?? '');
$ownerPhone = trim($input['owner_phone'] ?? '');

$planId = isset($input['plan_id']) ? (int) $input['plan_id'] : null;

$siteName = trim($input['site_name'] ?? '');
$domain = trim($input['domain'] ?? '');

$adminName = trim($input['admin_name'] ?? '');
$adminEmail = trim($input['admin_email'] ?? '');
$adminPassword = (string) ($input['admin_password'] ?? '');

$brandColor = trim($input['brand_color'] ?? '#2563eb');
$welcomeMessage = trim($input['welcome_message'] ?? 'سلام، چطور می‌تونیم کمکتون کنیم؟');

if ($tenantName === '') {
    json_response([
        'success' => false,
        'message' => 'Customer name is required'
    ], 422);
}

if (!$planId) {
    json_response([
        'success' => false,
        'message' => 'Plan is required'
    ], 422);
}

if ($siteName === '') {
    $siteName = $tenantName;
}

if ($domain === '') {
    json_response([
        'success' => false,
        'message' => 'Domain is required'
    ], 422);
}

if ($adminName === '') {
    $adminName = $ownerName !== '' ? $ownerName : 'Customer Admin';
}

if ($adminEmail === '' || !filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
    json_response([
        'success' => false,
        'message' => 'Valid admin email is required'
    ], 422);
}

if (strlen($adminPassword) < 8) {
    json_response([
        'success' => false,
        'message' => 'Admin password must be at least 8 characters'
    ], 422);
}

try {
    $planStmt = $pdo->prepare("
        SELECT id, name, max_sites, price_monthly
        FROM plans
        WHERE id = :id AND is_active = 1
        LIMIT 1
    ");

    $planStmt->execute([
        ':id' => $planId
    ]);


    $plan = $planStmt->fetch();
    if (!$plan) {
        json_response([
            'success' => false,
            'message' => 'Selected plan was not found'
        ], 404);
    }
    if ((int) $plan['max_sites'] < 1) {
        json_response([
            'success' => false,
            'message' => 'Selected plan does not allow creating a site',
        ], 422);
    }

    $emailStmt = $pdo->prepare("
        SELECT id
        FROM users
        WHERE email = :email
        LIMIT 1
    ");

    $emailStmt->execute([
        ':email' => $adminEmail
    ]);

    if ($emailStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'A user with this email already exists'
        ], 409);
    }

    $domainStmt = $pdo->prepare("
        SELECT id
        FROM sites
        WHERE domain = :domain
        LIMIT 1
    ");

    $domainStmt->execute([
        ':domain' => $domain
    ]);

    if ($domainStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'A site with this domain already exists'
        ], 409);
    }

    $pdo->beginTransaction();

    $tenantStmt = $pdo->prepare("
        INSERT INTO tenants (
            name,
            owner_name,
            owner_email,
            owner_phone,
            plan_id,
            status
        ) VALUES (
            :name,
            :owner_name,
            :owner_email,
            :owner_phone,
            :plan_id,
            'active'
        )
    ");

    $tenantStmt->execute([
        ':name' => $tenantName,
        ':owner_name' => $ownerName !== '' ? $ownerName : null,
        ':owner_email' => $ownerEmail !== '' ? $ownerEmail : $adminEmail,
        ':owner_phone' => $ownerPhone !== '' ? $ownerPhone : null,
        ':plan_id' => $planId,
    ]);

    $tenantId = (int) $pdo->lastInsertId();

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
            'assistant',
            1
        )
    ");

    $siteStmt->execute([
        ':tenant_id' => $tenantId,
        ':name' => $siteName,
        ':domain' => $domain,
        ':site_key' => $siteKey,
        ':brand_name' => $tenantName,
        ':brand_color' => $brandColor,
        ':welcome_message' => $welcomeMessage,
    ]);

    $siteId = (int) $pdo->lastInsertId();

    $passwordHash = password_hash($adminPassword, PASSWORD_DEFAULT);

    $userStmt = $pdo->prepare("
        INSERT INTO users (
            tenant_id,
            name,
            email,
            phone,
            password_hash,
            role,
            is_active
        ) VALUES (
            :tenant_id,
            :name,
            :email,
            :phone,
            :password_hash,
            'customer_admin',
            1
        )
    ");

    $userStmt->execute([
        ':tenant_id' => $tenantId,
        ':name' => $adminName,
        ':email' => $adminEmail,
        ':phone' => $ownerPhone !== '' ? $ownerPhone : null,
        ':password_hash' => $passwordHash,
    ]);

    $adminUserId = (int) $pdo->lastInsertId();

    $subscriptionStmt = $pdo->prepare("\n        INSERT INTO tenant_subscriptions (\n            tenant_id, plan_id, status, billing_cycle, starts_at, ends_at,\n            auto_renew, price, currency, created_by\n        ) VALUES (\n            :tenant_id, :plan_id, 'active', 'manual', NOW(),\n            DATE_ADD(NOW(), INTERVAL 1 YEAR), 0, :price, 'IRR', :created_by\n        )\n    ");
    $subscriptionStmt->execute([
        ':tenant_id' => $tenantId,
        ':plan_id' => $planId,
        ':price' => (float) $plan['price_monthly'],
        ':created_by' => $user['id'],
    ]);

    $accessStmt = $pdo->prepare("
        INSERT INTO agent_site_access (
            user_id,
            site_id
        ) VALUES (
            :user_id,
            :site_id
        )
    ");

    $accessStmt->execute([
        ':user_id' => $adminUserId,
        ':site_id' => $siteId,
    ]);

    $pdo->commit();

    $installCode = '<script src="https://yourdomain.com/widget.js" data-site-key="' . htmlspecialchars($siteKey, ENT_QUOTES, 'UTF-8') . '"></script>';

    json_response([
        'success' => true,
        'message' => 'Customer created successfully',
        'customer' => [
            'tenant_id' => $tenantId,
            'tenant_name' => $tenantName,
            'plan_id' => $planId,
            'plan_name' => $plan['name'],
        ],
        'site' => [
            'site_id' => $siteId,
            'site_name' => $siteName,
            'domain' => $domain,
            'site_key' => $siteKey,
            'install_code' => $installCode,
        ],
        'admin_user' => [
            'id' => $adminUserId,
            'name' => $adminName,
            'email' => $adminEmail,
            'role' => 'customer_admin',
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to create customer',
        'error' => $e->getMessage()
    ], 500);
}
