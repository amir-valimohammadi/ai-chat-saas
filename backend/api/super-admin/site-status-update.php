<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/site-status-update.php
// هدف: فعال یا غیرفعال کردن امن سایت توسط Super Admin

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

if (!array_key_exists('is_active', $input)) {
    json_response([
        'success' => false,
        'message' => 'is_active is required',
    ], 422);
}

$isActive = filter_var($input['is_active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_id is required',
    ], 422);
}

if ($isActive === null) {
    json_response([
        'success' => false,
        'message' => 'Invalid is_active value',
    ], 422);
}

try {
    $siteStmt = $pdo->prepare("
        SELECT id, tenant_id, name, domain, is_active
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

    $previousState = (bool) $site['is_active'];

    if ($previousState !== $isActive) {
        $updateStmt = $pdo->prepare("
            UPDATE sites
            SET is_active = :is_active
            WHERE id = :site_id
        ");
        $updateStmt->execute([
            ':is_active' => $isActive ? 1 : 0,
            ':site_id' => $siteId,
        ]);
    }

    json_response([
        'success' => true,
        'message' => $previousState === $isActive
            ? 'Site status was already up to date'
            : 'Site status updated',
        'site' => [
            'id' => (int) $site['id'],
            'tenant_id' => (int) $site['tenant_id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
            'previous_is_active' => $previousState,
            'is_active' => $isActive,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] site-status-update failed: ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'Failed to update site status',
        'error' => $e->getMessage(),
    ], 500);
}
