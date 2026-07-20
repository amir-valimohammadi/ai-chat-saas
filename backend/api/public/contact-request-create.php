<?php

// مسیر فایل: backend/api/public/contact-request-create.php
// هدف: ثبت عمومی درخواست مشاوره، خرید، دمو و راه‌اندازی بدون نیاز به ورود

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/contact-requests.php';
require_once __DIR__ . '/../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$input = get_json_input();

// Honeypot: ربات‌ها معمولاً این فیلد مخفی را پر می‌کنند.
$honeypot = contact_request_trim($input['company_website'] ?? '', 300);
if ($honeypot !== '') {
    json_response([
        'success' => true,
        'message' => 'درخواست شما ثبت شد.',
        'tracking_code' => 'REQ-PENDING',
    ], 201);
}

$ipIdentifier = rate_limit_identifier('public-contact-request');
enforce_rate_limit(
    $pdo,
    'public_contact_request_ip',
    $ipIdentifier,
    6,
    3600,
    'تعداد درخواست‌های ثبت‌شده از این اتصال زیاد است. کمی بعد دوباره تلاش کنید.'
);

$fullName = contact_request_trim($input['full_name'] ?? '', 190);
$rawPhone = contact_request_trim($input['phone'] ?? '', 32);
$phone = contact_request_normalize_phone($rawPhone);
$businessName = contact_request_trim($input['business_name'] ?? '', 190);
$email = strtolower(contact_request_trim($input['email'] ?? '', 190));
$websiteRaw = contact_request_trim($input['website_url'] ?? '', 500);
$requestType = contact_request_trim($input['request_type'] ?? '', 50);
$businessField = contact_request_trim($input['business_field'] ?? '', 120);
$monthlyConversations = contact_request_trim($input['monthly_conversations'] ?? '', 50);
$websiteTechnology = contact_request_trim($input['website_technology'] ?? '', 100);
$preferredContact = contact_request_trim($input['preferred_contact'] ?? 'phone', 20);
$preferredContactTime = contact_request_trim($input['preferred_contact_time'] ?? '', 100);
$description = contact_request_trim($input['description'] ?? '', 3000);
$sourcePage = contact_request_trim($input['source_page'] ?? '', 500);
$sourceCampaign = contact_request_trim($input['source_campaign'] ?? '', 100);
$consentContact = filter_var($input['consent_contact'] ?? false, FILTER_VALIDATE_BOOLEAN);
$sitesCount = isset($input['sites_count']) && $input['sites_count'] !== '' ? (int) $input['sites_count'] : null;
$agentsCount = isset($input['agents_count']) && $input['agents_count'] !== '' ? (int) $input['agents_count'] : null;
$desiredPlanId = isset($input['desired_plan_id']) && $input['desired_plan_id'] !== ''
    ? (int) $input['desired_plan_id']
    : null;

if (function_exists('mb_strlen')) {
    $nameLength = mb_strlen($fullName, 'UTF-8');
} else {
    $nameLength = strlen($fullName);
}

if ($nameLength < 2) {
    json_response([
        'success' => false,
        'message' => 'نام و نام خانوادگی را کامل وارد کنید.',
    ], 422);
}

if (!contact_request_valid_phone($phone)) {
    json_response([
        'success' => false,
        'message' => 'شماره موبایل معتبر وارد کنید.',
    ], 422);
}

if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response([
        'success' => false,
        'message' => 'ایمیل واردشده معتبر نیست.',
    ], 422);
}

$websiteUrl = null;
if ($websiteRaw !== '') {
    $websiteUrl = contact_request_normalize_website($websiteRaw);

    if ($websiteUrl === null) {
        json_response([
            'success' => false,
            'message' => 'آدرس وب‌سایت معتبر نیست.',
        ], 422);
    }
}

$requestTypes = contact_request_types();
if (!array_key_exists($requestType, $requestTypes)) {
    json_response([
        'success' => false,
        'message' => 'هدف درخواست را انتخاب کنید.',
    ], 422);
}

$contactMethods = contact_request_contact_methods();
if (!array_key_exists($preferredContact, $contactMethods)) {
    json_response([
        'success' => false,
        'message' => 'روش تماس انتخاب‌شده معتبر نیست.',
    ], 422);
}

if (!$consentContact) {
    json_response([
        'success' => false,
        'message' => 'برای ثبت درخواست، اجازه تماس تیم محصول را تأیید کنید.',
    ], 422);
}

if ($sitesCount !== null && ($sitesCount < 1 || $sitesCount > 1000)) {
    json_response([
        'success' => false,
        'message' => 'تعداد سایت‌ها معتبر نیست.',
    ], 422);
}

if ($agentsCount !== null && ($agentsCount < 1 || $agentsCount > 10000)) {
    json_response([
        'success' => false,
        'message' => 'تعداد پشتیبان‌ها معتبر نیست.',
    ], 422);
}

$plan = null;
if ($desiredPlanId !== null) {
    $planStmt = $pdo->prepare("\n        SELECT id, name\n        FROM plans\n        WHERE id = :id AND is_active = 1\n        LIMIT 1\n    ");
    $planStmt->execute([':id' => $desiredPlanId]);
    $plan = $planStmt->fetch();

    if (!$plan) {
        json_response([
            'success' => false,
            'message' => 'پلن انتخاب‌شده در دسترس نیست.',
        ], 422);
    }
}

$phoneIdentifier = rate_limit_identifier('phone:' . $phone);
enforce_rate_limit(
    $pdo,
    'public_contact_request_phone',
    $phoneIdentifier,
    3,
    1800,
    'برای این شماره چند درخواست ثبت شده است. کمی بعد دوباره تلاش کنید.'
);

$duplicateFingerprint = hash('sha256', implode('|', [
    $phone,
    $requestType,
    (string) ($desiredPlanId ?? 0),
    strtolower($businessName),
]));

try {
    $duplicateStmt = $pdo->prepare("\n        SELECT id, tracking_code\n        FROM customer_requests\n        WHERE duplicate_fingerprint = :fingerprint\n          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)\n        ORDER BY id DESC\n        LIMIT 1\n    ");
    $duplicateStmt->execute([':fingerprint' => $duplicateFingerprint]);
    $duplicate = $duplicateStmt->fetch();

    if ($duplicate) {
        json_response([
            'success' => true,
            'message' => 'این درخواست قبلاً ثبت شده است و تیم ما آن را بررسی می‌کند.',
            'tracking_code' => $duplicate['tracking_code'],
            'duplicate' => true,
        ]);
    }

    $trackingCode = contact_request_tracking_code();
    $ipAddress = function_exists('get_client_ip') ? get_client_ip() : ($_SERVER['REMOTE_ADDR'] ?? null);
    $userAgent = contact_request_trim($_SERVER['HTTP_USER_AGENT'] ?? '', 500);

    $pdo->beginTransaction();

    $insertStmt = $pdo->prepare("\n        INSERT INTO customer_requests (\n            tracking_code, full_name, phone, normalized_phone, business_name, email,\n            website_url, request_type, business_field, sites_count, agents_count,\n            monthly_conversations, desired_plan_id, desired_plan_name_snapshot,\n            website_technology, preferred_contact, preferred_contact_time, description,\n            consent_contact, source_page, source_campaign, ip_address, user_agent,\n            duplicate_fingerprint\n        ) VALUES (\n            :tracking_code, :full_name, :phone, :normalized_phone, :business_name, :email,\n            :website_url, :request_type, :business_field, :sites_count, :agents_count,\n            :monthly_conversations, :desired_plan_id, :desired_plan_name_snapshot,\n            :website_technology, :preferred_contact, :preferred_contact_time, :description,\n            1, :source_page, :source_campaign, :ip_address, :user_agent, :duplicate_fingerprint\n        )\n    ");

    $insertStmt->execute([
        ':tracking_code' => $trackingCode,
        ':full_name' => $fullName,
        ':phone' => $rawPhone !== '' ? $rawPhone : $phone,
        ':normalized_phone' => $phone,
        ':business_name' => $businessName !== '' ? $businessName : null,
        ':email' => $email !== '' ? $email : null,
        ':website_url' => $websiteUrl,
        ':request_type' => $requestType,
        ':business_field' => $businessField !== '' ? $businessField : null,
        ':sites_count' => $sitesCount,
        ':agents_count' => $agentsCount,
        ':monthly_conversations' => $monthlyConversations !== '' ? $monthlyConversations : null,
        ':desired_plan_id' => $desiredPlanId,
        ':desired_plan_name_snapshot' => $plan['name'] ?? null,
        ':website_technology' => $websiteTechnology !== '' ? $websiteTechnology : null,
        ':preferred_contact' => $preferredContact,
        ':preferred_contact_time' => $preferredContactTime !== '' ? $preferredContactTime : null,
        ':description' => $description !== '' ? $description : null,
        ':source_page' => $sourcePage !== '' ? $sourcePage : null,
        ':source_campaign' => $sourceCampaign !== '' ? $sourceCampaign : null,
        ':ip_address' => $ipAddress && $ipAddress !== 'unknown' ? substr($ipAddress, 0, 45) : null,
        ':user_agent' => $userAgent !== '' ? $userAgent : null,
        ':duplicate_fingerprint' => $duplicateFingerprint,
    ]);

    $requestId = (int) $pdo->lastInsertId();

    contact_request_insert_event(
        $pdo,
        $requestId,
        'created',
        null,
        'درخواست از صفحه عمومی محصول ثبت شد.',
        null,
        'new',
        [
            'request_type' => $requestType,
            'preferred_contact' => $preferredContact,
            'source_page' => $sourcePage,
        ]
    );

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'درخواست شما با موفقیت ثبت شد. تیم ما پس از بررسی اطلاعات با شما تماس می‌گیرد.',
        'tracking_code' => $trackingCode,
        'request' => [
            'preferred_contact' => $preferredContact,
            'preferred_contact_label' => $contactMethods[$preferredContact],
        ],
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('[PUBLIC_CONTACT_REQUEST_CREATE] ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'ثبت درخواست انجام نشد. لطفاً دوباره تلاش کنید.',
    ], 500);
}
