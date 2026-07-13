<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/widget-settings-update.php
// هدف: ویرایش تنظیمات ویجت یک سایت توسط Customer Admin

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

require_role($user, ['customer_admin']);

$input = get_json_input();

$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;
$brandName = trim($input['brand_name'] ?? '');
$brandColor = trim($input['brand_color'] ?? '#2563eb');
$logoUrl = trim($input['logo_url'] ?? '');
$welcomeMessage = trim($input['welcome_message'] ?? '');
$aiMode = trim($input['ai_mode'] ?? 'assistant');

$allowedAiModes = ['off', 'assistant', 'semi_auto'];

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Site ID is required'
    ], 422);
}

if (!in_array($aiMode, $allowedAiModes, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid AI mode'
    ], 422);
}

try {
    $siteStmt = $pdo->prepare("
        SELECT id
        FROM sites
        WHERE id = :id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");

    $siteStmt->execute([
        ':id' => $siteId,
        ':tenant_id' => $user['tenant_id']
    ]);

    if (!$siteStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        UPDATE sites
        SET
            brand_name = :brand_name,
            brand_color = :brand_color,
            logo_url = :logo_url,
            welcome_message = :welcome_message,
            ai_mode = :ai_mode
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':brand_name' => $brandName !== '' ? $brandName : null,
        ':brand_color' => $brandColor,
        ':logo_url' => $logoUrl !== '' ? $logoUrl : null,
        ':welcome_message' => $welcomeMessage,
        ':ai_mode' => $aiMode,
        ':id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Widget settings updated successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update widget settings',
        'error' => $e->getMessage()
    ], 500);
}