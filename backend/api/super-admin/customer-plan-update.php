<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-plan-update.php
// هدف: تغییر پلن مشتری توسط Super Admin

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
$planId = isset($input['plan_id']) ? (int) $input['plan_id'] : 0;

if ($tenantId <= 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_id is required'
    ], 422);
}

if ($planId <= 0) {
    json_response([
        'success' => false,
        'message' => 'plan_id is required'
    ], 422);
}

try {
    $planStmt = $pdo->prepare("
        SELECT id
        FROM plans
        WHERE id = :plan_id
        LIMIT 1
    ");

    $planStmt->execute([
        ':plan_id' => $planId,
    ]);

    if (!$planStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Plan not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        UPDATE tenants
        SET plan_id = :plan_id
        WHERE id = :tenant_id
    ");

    $stmt->execute([
        ':plan_id' => $planId,
        ':tenant_id' => $tenantId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Customer plan updated',
        'plan_id' => $planId,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update customer plan',
        'error' => $e->getMessage()
    ], 500);
}