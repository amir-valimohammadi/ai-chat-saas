<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/site-settings-update.php
// هدف: ویرایش تنظیمات اصلی سایت و ویجت توسط Super Admin

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

$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;

$name = trim($input['name'] ?? '');
$domain = trim($input['domain'] ?? '');
$brandName = trim($input['brand_name'] ?? '');
$brandColor = trim($input['brand_color'] ?? '#2563eb');
$logoUrl = trim($input['logo_url'] ?? '');
$welcomeMessage = trim($input['welcome_message'] ?? '');
$aiMode = trim($input['ai_mode'] ?? 'assistant');

$allowedAiModes = ['off', 'assistant', 'semi_auto'];

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_id is required'
    ], 422);
}

if ($name === '') {
    json_response([
        'success' => false,
        'message' => 'Site name is required'
    ], 422);
}

if ($domain === '') {
    json_response([
        'success' => false,
        'message' => 'Domain is required'
    ], 422);
}

if (!in_array($aiMode, $allowedAiModes, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid AI mode'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE sites
        SET
            name = :name,
            domain = :domain,
            brand_name = :brand_name,
            brand_color = :brand_color,
            logo_url = :logo_url,
            welcome_message = :welcome_message,
            ai_mode = :ai_mode
        WHERE id = :site_id
    ");

    $stmt->execute([
        ':name' => $name,
        ':domain' => $domain,
        ':brand_name' => $brandName !== '' ? $brandName : null,
        ':brand_color' => $brandColor !== '' ? $brandColor : '#2563eb',
        ':logo_url' => $logoUrl !== '' ? $logoUrl : null,
        ':welcome_message' => $welcomeMessage !== '' ? $welcomeMessage : null,
        ':ai_mode' => $aiMode,
        ':site_id' => $siteId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Site settings updated'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update site settings',
        'error' => $e->getMessage()
    ], 500);
}