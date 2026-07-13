<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-status-update.php
// هدف: تغییر وضعیت مشتری توسط Super Admin

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

$tenantId = isset($input['tenant_id']) ? (int) $input['tenant_id'] : 0;
$status = trim($input['status'] ?? '');

$allowedStatuses = ['active', 'inactive', 'suspended'];

if ($tenantId <= 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_id is required'
    ], 422);
}

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE tenants
        SET status = :status
        WHERE id = :tenant_id
    ");

    $stmt->execute([
        ':status' => $status,
        ':tenant_id' => $tenantId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Customer status updated',
        'status' => $status,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update customer status',
        'error' => $e->getMessage()
    ], 500);
}