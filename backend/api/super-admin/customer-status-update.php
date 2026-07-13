<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-status-update.php
// هدف: تغییر امن وضعیت مشتری توسط Super Admin

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
$tenantId = filter_var($input['tenant_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 1],
]);
$status = is_string($input['status'] ?? null) ? trim($input['status']) : '';

$allowedStatuses = ['active', 'inactive', 'suspended'];

if ($tenantId <= 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_id is required',
    ], 422);
}

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status',
    ], 422);
}

try {
    $tenantStmt = $pdo->prepare("
        SELECT id, name, status
        FROM tenants
        WHERE id = :tenant_id
        LIMIT 1
    ");
    $tenantStmt->execute([':tenant_id' => $tenantId]);

    $tenant = $tenantStmt->fetch();

    if (!$tenant) {
        json_response([
            'success' => false,
            'message' => 'Customer not found',
        ], 404);
    }

    $previousStatus = (string) $tenant['status'];

    if ($previousStatus !== $status) {
        $updateStmt = $pdo->prepare("
            UPDATE tenants
            SET status = :status
            WHERE id = :tenant_id
        ");
        $updateStmt->execute([
            ':status' => $status,
            ':tenant_id' => $tenantId,
        ]);
    }

    json_response([
        'success' => true,
        'message' => $previousStatus === $status
            ? 'Customer status was already up to date'
            : 'Customer status updated',
        'tenant' => [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'previous_status' => $previousStatus,
            'status' => $status,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] customer-status-update failed: ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'Failed to update customer status',
        'error' => $e->getMessage(),
    ], 500);
}
