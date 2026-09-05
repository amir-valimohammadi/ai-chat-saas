<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-plan-update.php
// هدف: تغییر امن پلن مشتری و ثبت Audit Log

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/plan-change.php';
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

$tenantId = filter_var(
    $input['tenant_id'] ?? 0,
    FILTER_VALIDATE_INT,
    [
        'options' => [
            'default' => 0,
            'min_range' => 1,
        ],
    ]
);

$planId = filter_var(
    $input['plan_id'] ?? 0,
    FILTER_VALIDATE_INT,
    [
        'options' => [
            'default' => 0,
            'min_range' => 1,
        ],
    ]
);

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

$cycle = $input['billing_cycle'] ?? null;
$price = plan_change_price($input['price'] ?? null);
$expectedPlanId = filter_var($input['expected_plan_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
if (!in_array($cycle, ['monthly', 'quarterly', 'yearly'], true) || $price === null
    || ($input['confirmed'] ?? null) !== true || $expectedPlanId === false) {
    json_response(['success' => false, 'message' => 'مدت، مبلغ معتبر به ریال و تأیید تغییر پلن الزامی است. صفحه را تازه کنید.'], 422);
}

try {
    $pdo->beginTransaction();
    $tenantStmt = $pdo->prepare("
        SELECT
            tenants.id,
            tenants.name,
            tenants.plan_id,
            current_plan.name AS current_plan_name
        FROM tenants
        LEFT JOIN plans AS current_plan
            ON current_plan.id = tenants.plan_id
        WHERE tenants.id = :tenant_id
        LIMIT 1
        FOR UPDATE
    ");

    $tenantStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $tenant = $tenantStmt->fetch();

    if (!$tenant) {
        $pdo->rollBack();
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
            price_monthly,
            is_active
        FROM plans
        WHERE id = :plan_id
        LIMIT 1
    ");

    $planStmt->execute([
        ':plan_id' => $planId,
    ]);

    $plan = $planStmt->fetch();

    if (!$plan) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'Plan not found',
        ], 404);
    }

    if ((int) $plan['is_active'] !== 1) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'Inactive plans cannot be assigned to customers',
        ], 422);
    }

    $previousPlanId = $tenant['plan_id'] !== null
        ? (int) $tenant['plan_id']
        : null;

    if ($previousPlanId === $planId) {
        $current = $pdo->prepare("SELECT id FROM tenant_subscriptions
            WHERE tenant_id=:tenant_id AND plan_id=:plan_id AND status='active'
                AND ends_at > NOW() AND billing_cycle=:cycle AND price=:price AND currency='IRR'
            LIMIT 1");
        $current->execute([':tenant_id' => $tenantId, ':plan_id' => $planId, ':cycle' => $cycle, ':price' => $price]);
        if (!$current->fetchColumn()) {
            $pdo->rollBack();
            json_response(['success' => false, 'message' => 'پلن انتخاب‌شده فعلی است اما شرایط اشتراک متفاوت است. برای تمدید یا اصلاح شرایط، از بخش اشتراک‌ها استفاده کنید.'], 409);
        }
    }

    if ($previousPlanId !== $planId) {
        if (($previousPlanId ?? 0) !== $expectedPlanId) {
            $pdo->rollBack();
            json_response(['success' => false, 'message' => 'پلن مشتری تغییر کرده است؛ صفحه را تازه کنید و دوباره تأیید کنید.'], 409);
        }
        $startsAt = new DateTimeImmutable('now');
        $endsAt = plan_change_end($startsAt, $cycle);

        $updateStmt = $pdo->prepare("
            UPDATE tenants
            SET plan_id = :plan_id
            WHERE id = :tenant_id
        ");

        $updateStmt->execute([
            ':plan_id' => $planId,
            ':tenant_id' => $tenantId,
        ]);

        $pdo->prepare("
            UPDATE tenant_subscriptions
            SET status = 'cancelled', updated_at = NOW()
            WHERE tenant_id = :tenant_id
              AND status IN ('trial','active','past_due','suspended')
        ")->execute([':tenant_id' => $tenantId]);

        $subscriptionStmt = $pdo->prepare("
            INSERT INTO tenant_subscriptions (
                tenant_id, plan_id, status, billing_cycle, starts_at, ends_at,
                auto_renew, price, currency, created_by
            ) VALUES (
                :tenant_id, :plan_id, 'active', :cycle, :starts_at,
                :ends_at, 0, :price, 'IRR', :created_by
            )
        ");
        $subscriptionStmt->execute([
            ':tenant_id' => $tenantId,
            ':plan_id' => $planId,
            ':cycle' => $cycle,
            ':starts_at' => $startsAt->format('Y-m-d H:i:s'),
            ':ends_at' => $endsAt->format('Y-m-d H:i:s'),
            ':price' => $price,
            ':created_by' => $user['id'],
        ]);

        admin_audit_log(
            $pdo,
            $user,
            'customer.plan_changed',
            'tenant',
            $tenantId,
            sprintf(
                'پلن مشتری «%s» از %s به %s تغییر کرد.',
                $tenant['name'],
                $tenant['current_plan_name'] ?: 'بدون پلن',
                $plan['name']
            ),
            [
                'plan_id' => $previousPlanId,
                'plan_name' => $tenant['current_plan_name'],
            ],
            [
                'plan_id' => (int) $plan['id'],
                'plan_name' => $plan['name'],
                'billing_cycle' => $cycle,
                'price' => $price,
                'currency' => 'IRR',
                'starts_at' => $startsAt->format('Y-m-d H:i:s'),
                'ends_at' => $endsAt->format('Y-m-d H:i:s'),
            ],
            [
                'tenant_id' => $tenantId,
                'plan_id' => (int) $plan['id'],
            ]
        );

    }

    $pdo->commit();

    json_response([
        'success' => true,
        'changed' => $previousPlanId !== $planId,
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
            'max_monthly_conversations' =>
                (int) $plan['max_monthly_conversations'],
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log(
        '[AI_CHAT_SAAS] customer-plan-update failed: ' . $e->getMessage()
    );

    $payload = [
        'success' => false,
        'message' => 'Failed to update customer plan',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
