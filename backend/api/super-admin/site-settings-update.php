<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/site-settings-update.php
// هدف: ویرایش امن تنظیمات سایت و ویجت توسط Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$input = get_json_input();
$siteId = filter_var($input['site_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 1],
]);

$name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
$domain = is_string($input['domain'] ?? null) ? trim($input['domain']) : '';
$brandName = is_string($input['brand_name'] ?? null) ? trim($input['brand_name']) : '';
$brandColor = is_string($input['brand_color'] ?? null) ? trim($input['brand_color']) : '#2563eb';
$logoUrl = is_string($input['logo_url'] ?? null) ? trim($input['logo_url']) : '';
$welcomeMessage = is_string($input['welcome_message'] ?? null)
    ? trim($input['welcome_message'])
    : '';
$aiMode = is_string($input['ai_mode'] ?? null) ? trim($input['ai_mode']) : 'assistant';

$allowedAiModes = ['off', 'assistant', 'semi_auto'];
$length = static function (string $value): int {
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
};

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_id is required',
    ], 422);
}

if ($name === '' || $length($name) > 255) {
    json_response([
        'success' => false,
        'message' => 'Site name is required and must not exceed 255 characters',
    ], 422);
}

if ($domain === '' || $length($domain) > 255 || preg_match('/[\r\n\s]/', $domain)) {
    json_response([
        'success' => false,
        'message' => 'Domain is invalid',
    ], 422);
}

if ($brandName !== '' && $length($brandName) > 255) {
    json_response([
        'success' => false,
        'message' => 'Brand name must not exceed 255 characters',
    ], 422);
}

if (!preg_match('/^#[0-9a-fA-F]{6}$/', $brandColor)) {
    json_response([
        'success' => false,
        'message' => 'Brand color must be a valid HEX color',
    ], 422);
}

if ($logoUrl !== '') {
    $validatedLogo = filter_var($logoUrl, FILTER_VALIDATE_URL);
    $logoScheme = strtolower((string) parse_url($logoUrl, PHP_URL_SCHEME));

    if (!$validatedLogo || !in_array($logoScheme, ['http', 'https'], true)) {
        json_response([
            'success' => false,
            'message' => 'Logo URL must be a valid http or https URL',
        ], 422);
    }

    if ($length($logoUrl) > 2048) {
        json_response([
            'success' => false,
            'message' => 'Logo URL is too long',
        ], 422);
    }
}

if ($length($welcomeMessage) > 300) {
    json_response([
        'success' => false,
        'message' => 'Welcome message must not exceed 300 characters',
    ], 422);
}

if (!in_array($aiMode, $allowedAiModes, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid AI mode',
    ], 422);
}

try {
    $siteStmt = $pdo->prepare("
        SELECT id, tenant_id
        FROM sites
        WHERE id = :site_id
        LIMIT 1
    ");
    $siteStmt->execute([':site_id' => $siteId]);

    $site = $siteStmt->fetch();

    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found',
        ], 404);
    }

    $duplicateStmt = $pdo->prepare("
        SELECT id
        FROM sites
        WHERE domain = :domain
          AND id <> :site_id
        LIMIT 1
    ");
    $duplicateStmt->execute([
        ':domain' => $domain,
        ':site_id' => $siteId,
    ]);

    if ($duplicateStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'This domain is already assigned to another site',
        ], 409);
    }

    $updateStmt = $pdo->prepare("
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
    $updateStmt->execute([
        ':name' => $name,
        ':domain' => $domain,
        ':brand_name' => $brandName !== '' ? $brandName : null,
        ':brand_color' => strtolower($brandColor),
        ':logo_url' => $logoUrl !== '' ? $logoUrl : null,
        ':welcome_message' => $welcomeMessage !== '' ? $welcomeMessage : null,
        ':ai_mode' => $aiMode,
        ':site_id' => $siteId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Site settings updated',
        'site' => [
            'id' => (int) $site['id'],
            'tenant_id' => (int) $site['tenant_id'],
            'name' => $name,
            'domain' => $domain,
            'brand_name' => $brandName !== '' ? $brandName : null,
            'brand_color' => strtolower($brandColor),
            'logo_url' => $logoUrl !== '' ? $logoUrl : null,
            'welcome_message' => $welcomeMessage !== '' ? $welcomeMessage : null,
            'ai_mode' => $aiMode,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] site-settings-update failed: ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'Failed to update site settings',
        'error' => $e->getMessage(),
    ], 500);
}
