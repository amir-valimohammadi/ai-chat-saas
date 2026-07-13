<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/site-status-update.php
// هدف: فعال / غیرفعال کردن سایت توسط Super Admin

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
$isActive = isset($input['is_active']) ? (bool) $input['is_active'] : false;

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_id is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE sites
        SET is_active = :is_active
        WHERE id = :site_id
    ");

    $stmt->execute([
        ':is_active' => $isActive ? 1 : 0,
        ':site_id' => $siteId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Site status updated',
        'is_active' => $isActive,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update site status',
        'error' => $e->getMessage()
    ], 500);
}