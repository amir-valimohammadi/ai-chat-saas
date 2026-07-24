<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-create.php
// هدف: ایجاد مشتری جدید + سایت + حساب مدیر مشتری توسط Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/contact-requests.php';
require_once __DIR__ . '/../../includes/hosted-support.php';
require_once __DIR__ . '/../../includes/routing.php';
require_once __DIR__ . '/../../includes/customer-360.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$input = get_json_input();

$requestId = isset($input['request_id']) ? (int) $input['request_id'] : null;
$requestRecord = null;

$tenantName = trim($input['tenant_name'] ?? '');
$ownerName = trim($input['owner_name'] ?? '');
$ownerEmail = trim($input['owner_email'] ?? '');
$ownerPhone = trim($input['owner_phone'] ?? '');

$planId = isset($input['plan_id']) ? (int) $input['plan_id'] : null;

$siteName = trim($input['site_name'] ?? '');
$domain = trim($input['domain'] ?? '');
$accessMode = trim((string) ($input['access_mode'] ?? 'widget'));
$hostedSlugInput = hosted_support_normalize_slug((string) ($input['hosted_slug'] ?? ''));
$hostedPageTitle = trim((string) ($input['hosted_page_title'] ?? ''));
$hostedPageSubtitle = trim((string) ($input['hosted_page_subtitle'] ?? 'پشتیبانی و ارتباط مستقیم'));

if (!in_array($accessMode, ['widget', 'hosted', 'both'], true)) {
    $accessMode = 'widget';
}

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

$requiresWebsiteDomain = in_array($accessMode, ['widget', 'both'], true);
$createsHostedPage = in_array($accessMode, ['hosted', 'both'], true);

if ($requiresWebsiteDomain && $domain === '') {
    json_response([
        'success' => false,
        'message' => 'Domain is required for widget installation'
    ], 422);
}

if ($domain !== '' && (mb_strlen($domain, 'UTF-8') > 255 || preg_match('/[\r\n\s]/', $domain))) {
    json_response([
        'success' => false,
        'message' => 'Domain is invalid'
    ], 422);
}

if ($hostedSlugInput !== '' && !hosted_support_slug_is_valid($hostedSlugInput)) {
    json_response([
        'success' => false,
        'message' => 'Hosted support slug is invalid'
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

if ($requestId !== null && $requestId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Invalid customer request'
    ], 422);
}

try {
    if ($requestId !== null) {
        $requestStmt = $pdo->prepare("
            SELECT id, tracking_code, status, converted_tenant_id
            FROM customer_requests
            WHERE id = :id
            LIMIT 1
        ");
        $requestStmt->execute([':id' => $requestId]);
        $requestRecord = $requestStmt->fetch();

        if (!$requestRecord) {
            json_response([
                'success' => false,
                'message' => 'Customer request was not found'
            ], 404);
        }

        if ($requestRecord['status'] === 'converted' || $requestRecord['converted_tenant_id'] !== null) {
            json_response([
                'success' => false,
                'message' => 'This request has already been converted to a customer'
            ], 409);
        }
    }
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

    $hostedSlug = null;
    if ($createsHostedPage) {
        if ($hostedSlugInput !== '') {
            $slugStmt = $pdo->prepare("SELECT id FROM hosted_support_pages WHERE public_slug = :slug LIMIT 1");
            $slugStmt->execute([':slug' => $hostedSlugInput]);

            if ($slugStmt->fetch()) {
                json_response([
                    'success' => false,
                    'message' => 'Hosted support link is already in use'
                ], 409);
            }

            $hostedSlug = $hostedSlugInput;
        } else {
            $hostedSlug = hosted_support_generate_slug($pdo, $tenantName);
        }

        if ($accessMode === 'hosted') {
            $domain = hosted_support_public_url($hostedSlug);
        }
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

    // قفل رکورد درخواست برای جلوگیری از تبدیل هم‌زمان یک درخواست به چند مشتری.
    if ($requestId !== null) {
        $requestLockStmt = $pdo->prepare("
            SELECT id, tracking_code, status, converted_tenant_id
            FROM customer_requests
            WHERE id = :id
            LIMIT 1
            FOR UPDATE
        ");
        $requestLockStmt->execute([':id' => $requestId]);
        $lockedRequest = $requestLockStmt->fetch();

        if (!$lockedRequest) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Customer request was not found'
            ], 404);
        }

        if ($lockedRequest['status'] === 'converted' || $lockedRequest['converted_tenant_id'] !== null) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'This request has already been converted to a customer'
            ], 409);
        }

        $requestRecord = $lockedRequest;
    }

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

    $hostedUrl = null;
    if ($createsHostedPage && $hostedSlug !== null) {
        $pageTitle = $hostedPageTitle !== ''
            ? $hostedPageTitle
            : ($tenantName . ' | پشتیبانی آنلاین');

        $hostedStmt = $pdo->prepare("
            INSERT INTO hosted_support_pages (
                tenant_id, site_id, public_slug, page_title, page_subtitle,
                page_description, primary_color, contact_phone, whatsapp_phone,
                timezone, require_name, require_phone, show_business_hours,
                show_faq, is_active
            ) VALUES (
                :tenant_id, :site_id, :public_slug, :page_title, :page_subtitle,
                :page_description, :primary_color, :contact_phone, :whatsapp_phone,
                :timezone, 1, 1, 1, 1, 1
            )
        ");
        $hostedStmt->execute([
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
            ':public_slug' => $hostedSlug,
            ':page_title' => $pageTitle,
            ':page_subtitle' => $hostedPageSubtitle !== '' ? $hostedPageSubtitle : null,
            ':page_description' => 'برای دریافت راهنمایی، پیگیری یا مشاوره، گفتگو را آغاز کنید.',
            ':primary_color' => strtolower($brandColor),
            ':contact_phone' => $ownerPhone !== '' ? $ownerPhone : null,
            ':whatsapp_phone' => $ownerPhone !== '' ? $ownerPhone : null,
            ':timezone' => (string) app_config('timezone', 'Asia/Tehran'),
        ]);

        hosted_support_ensure_defaults($pdo, $siteId);
        $hostedUrl = hosted_support_public_url($hostedSlug);
    }

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

    customer360_ensure_onboarding($pdo, $tenantId);
    customer360_sync_detectable_onboarding($pdo, $tenantId);

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

    $defaultDepartmentId = routing_ensure_default_department($pdo, $tenantId, $siteId, $adminUserId);

    if ($requestId !== null && $requestRecord) {
        $requestUpdateStmt = $pdo->prepare("
            UPDATE customer_requests
            SET status = 'converted',
                converted_tenant_id = :tenant_id,
                converted_at = NOW(),
                follow_up_at = NULL
            WHERE id = :request_id
              AND status <> 'converted'
        ");
        $requestUpdateStmt->execute([
            ':tenant_id' => $tenantId,
            ':request_id' => $requestId,
        ]);

        contact_request_insert_event(
            $pdo,
            $requestId,
            'converted',
            $user,
            'درخواست به مشتری «' . $tenantName . '» تبدیل شد.',
            $requestRecord['status'],
            'converted',
            [
                'tenant_id' => $tenantId,
                'site_id' => $siteId,
                'admin_user_id' => $adminUserId,
            ]
        );
    }

    $pdo->commit();

    $installCode = in_array($accessMode, ['widget', 'both'], true)
        ? '<script src="' . htmlspecialchars((string) app_config('widget_script_url'), ENT_QUOTES, 'UTF-8') . '" data-site-key="' . htmlspecialchars($siteKey, ENT_QUOTES, 'UTF-8') . '"></script>'
        : null;

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
            'access_mode' => $accessMode,
            'hosted_support_url' => $hostedUrl,
            'hosted_support_slug' => $hostedSlug,
            'default_department_id' => $defaultDepartmentId,
        ],
        'hosted_support' => $hostedUrl ? [
            'url' => $hostedUrl,
            'slug' => $hostedSlug,
            'active' => true,
        ] : null,
        'admin_user' => [
            'id' => $adminUserId,
            'name' => $adminName,
            'email' => $adminEmail,
            'role' => 'customer_admin',
        ],
        'source_request' => $requestId !== null ? [
            'id' => $requestId,
            'tracking_code' => $requestRecord['tracking_code'] ?? null,
            'status' => 'converted',
        ] : null,
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = ['success' => false, 'message' => 'Failed to create customer'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
