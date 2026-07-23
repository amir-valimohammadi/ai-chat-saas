<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/visitor-start.php
// هدف: ثبت یا بروزرسانی بازدیدکننده سایت مشتری + کنترل Origin + اعتبارسنجی ورودی‌ها

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$input = get_json_input();

$siteKey = trim($input['site_key'] ?? '');
$browserId = trim($input['browser_id'] ?? '');
$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$phone = trim($input['phone'] ?? '');

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

if ($browserId === '') {
    $browserId = bin2hex(random_bytes(16));
}

if (mb_strlen($browserId, 'UTF-8') > 120) {
    json_response([
        'success' => false,
        'message' => 'Invalid browser_id'
    ], 422);
}

if (mb_strlen($name, 'UTF-8') > 120) {
    json_response([
        'success' => false,
        'message' => 'Name is too long'
    ], 422);
}

if (mb_strlen($phone, 'UTF-8') > 40) {
    json_response([
        'success' => false,
        'message' => 'Phone is too long'
    ], 422);
}

if (mb_strlen($email, 'UTF-8') > 190) {
    json_response([
        'success' => false,
        'message' => 'Email is too long'
    ], 422);
}

if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response([
        'success' => false,
        'message' => 'Invalid email'
    ], 422);
}

enforce_rate_limit(
    $pdo,
    'widget_visitor_start',
    rate_limit_identifier($siteKey . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    30,
    10 * 60,
    'Too many visitor requests. Please try again later.'
);

try {
    $siteStmt = $pdo->prepare("
        SELECT
            sites.id,
            sites.domain
        FROM sites
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE sites.site_key = :site_key
          AND sites.is_active = 1
          AND tenants.status = 'active'
        LIMIT 1
    ");

    $siteStmt->execute([
        ':site_key' => $siteKey
    ]);

    $site = $siteStmt->fetch();

    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    validate_widget_origin_or_fail($site['domain']);

    $siteId = (int) $site['id'];
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
    $userAgent = mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500, 'UTF-8');

    $visitorStmt = $pdo->prepare("
        SELECT id
        FROM visitors
        WHERE site_id = :site_id
          AND browser_id = :browser_id
        LIMIT 1
    ");

    $visitorStmt->execute([
        ':site_id' => $siteId,
        ':browser_id' => $browserId
    ]);

    $visitor = $visitorStmt->fetch();

    if ($visitor) {
        $visitorId = (int) $visitor['id'];

        $updateStmt = $pdo->prepare("
            UPDATE visitors
            SET
                name = COALESCE(NULLIF(:name, ''), name),
                email = COALESCE(NULLIF(:email, ''), email),
                phone = COALESCE(NULLIF(:phone, ''), phone),
                ip_address = :ip_address,
                user_agent = :user_agent,
                last_seen_at = NOW()
            WHERE id = :id
        ");

        $updateStmt->execute([
            ':name' => $name,
            ':email' => $email,
            ':phone' => $phone,
            ':ip_address' => $ipAddress,
            ':user_agent' => $userAgent,
            ':id' => $visitorId,
        ]);
    } else {
        $insertStmt = $pdo->prepare("
            INSERT INTO visitors (
                site_id,
                name,
                email,
                phone,
                browser_id,
                ip_address,
                user_agent,
                last_seen_at
            ) VALUES (
                :site_id,
                :name,
                :email,
                :phone,
                :browser_id,
                :ip_address,
                :user_agent,
                NOW()
            )
        ");

        $insertStmt->execute([
            ':site_id' => $siteId,
            ':name' => $name !== '' ? $name : null,
            ':email' => $email !== '' ? $email : null,
            ':phone' => $phone !== '' ? $phone : null,
            ':browser_id' => $browserId,
            ':ip_address' => $ipAddress,
            ':user_agent' => $userAgent,
        ]);

        $visitorId = (int) $pdo->lastInsertId();
    }

    json_response([
        'success' => true,
        'visitor' => [
            'id' => $visitorId,
            'site_id' => $siteId,
            'browser_id' => $browserId,
            'name' => $name !== '' ? $name : null,
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null,
        ]
    ]);
} catch (Exception $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to start visitor',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}