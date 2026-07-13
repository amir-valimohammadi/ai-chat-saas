<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-plan-update.php
// هدف: تغییر امن پلن مشتری توسط Super Admin

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
$planId = filter_var($input['plan_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 1],
]);

if ($tenantId <= 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_id is required',
    ], 422);
}

if ($planId <= 0) {
    json_response([
        'success' => false,
        'message' => 'plan_id is required',
    ], 422);
}

try {
    $tenantStmt = $pdo->prepare("
        SELECT id, name, plan_id
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

    $planStmt = $pdo->prepare("
        SELECT
            id,
            name,
            max_sites,
            max_agents,
            max_monthly_conversations,
            is_active
        FROM plans
        WHERE id = :plan_id
        LIMIT 1
    ");
    $planStmt->execute([':plan_id' => $planId]);

    $plan = $planStmt->fetch();

    if (!$plan) {
        json_response([
            'success' => false,
            'message' => 'Plan not found',
        ], 404);
    }

    if ((int) $plan['is_active'] !== 1) {
        json_response([
            'success' => false,
            'message' => 'Inactive plans cannot be assigned to customers',
        ], 422);
    }

    $previousPlanId = $tenant['plan_id'] !== null ? (int) $tenant['plan_id'] : null;

    if ($previousPlanId !== $planId) {
        $updateStmt = $pdo->prepare("
            UPDATE tenants
            SET plan_id = :plan_id
            WHERE id = :tenant_id
        ");
        $updateStmt->execute([
            ':plan_id' => $planId,
            ':tenant_id' => $tenantId,
        ]);
    }

    json_response([
        'success' => true,
        'message' => $previousPlanId === $planId
            ? 'Customer plan was already up to date'
            : 'Customer plan updated',
        'tenant' => [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'previous_plan_id' => $previousPlanId,
            'plan_id' => $planId,
        ],
        'plan' => [
            'id' => (int) $plan['id'],
            'name' => $plan['name'],
            'max_sites' => (int) $plan['max_sites'],
            'max_agents' => (int) $plan['max_agents'],
            'max_monthly_conversations' => (int) $plan['max_monthly_conversations'],
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] customer-plan-update failed: ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'Failed to update customer plan',
        'error' => $e->getMessage(),
    ], 500);
}
