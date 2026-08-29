<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plan-toggle-status.php
// هدف: فعال یا غیرفعال کردن امن پلن و ثبت Audit Log

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
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

$planId = isset($input['id'])
    ? (int) $input['id']
    : 0;

if ($planId <= 0) {
    json_response([
        'success' => false,
        'message' => 'شناسه پلن الزامی است.',
    ], 422);
}

if (!array_key_exists('is_active', $input)) {
    json_response([
        'success' => false,
        'message' => 'وضعیت پلن الزامی است.',
    ], 422);
}

$isActive = filter_var(
    $input['is_active'],
    FILTER_VALIDATE_BOOLEAN,
    FILTER_NULL_ON_FAILURE
);

if ($isActive === null) {
    json_response([
        'success' => false,
        'message' => 'وضعیت پلن معتبر نیست.',
    ], 422);
}

try {
    $planStmt = $pdo->prepare("
        SELECT
            plans.id,
            plans.name,
            plans.is_active,
            (
                SELECT COUNT(*)
                FROM tenants
                WHERE tenants.plan_id = plans.id
            ) AS customers_count
        FROM plans
        WHERE plans.id = :id
        LIMIT 1
    ");

    $planStmt->execute([
        ':id' => $planId,
    ]);

    $plan = $planStmt->fetch();

    if (!$plan) {
        json_response([
            'success' => false,
            'message' => 'پلن پیدا نشد.',
        ], 404);
    }

    $previousState = (bool) $plan['is_active'];

    if ($previousState !== $isActive) {
        $pdo->beginTransaction();

        $updateStmt = $pdo->prepare("
            UPDATE plans
            SET is_active = :is_active
            WHERE id = :id
        ");

        $updateStmt->execute([
            ':id' => $planId,
            ':is_active' => $isActive ? 1 : 0,
        ]);

        admin_audit_log(
            $pdo,
            $user,
            'plan.status_changed',
            'plan',
            $planId,
            sprintf(
                'وضعیت پلن «%s» از %s به %s تغییر کرد.',
                $plan['name'],
                $previousState ? 'فعال' : 'غیرفعال',
                $isActive ? 'فعال' : 'غیرفعال'
            ),
            [
                'is_active' => $previousState,
            ],
            [
                'is_active' => $isActive,
            ],
            [
                'plan_id' => $planId,
            ]
        );

        $pdo->commit();
    }

    $warning = null;

    if (
        !$isActive
        && (int) $plan['customers_count'] > 0
    ) {
        $warning = sprintf(
            'پلن غیرفعال شد. تخصیص فعلی %d مشتری حفظ شده است، اما پلن برای تخصیص جدید قابل انتخاب نیست.',
            (int) $plan['customers_count']
        );
    }

    json_response([
        'success' => true,
        'message' => $previousState === $isActive
            ? 'وضعیت پلن از قبل به‌روز بود.'
            : 'وضعیت پلن تغییر کرد.',
        'is_active' => $isActive,
        'warning' => $warning,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'تغییر وضعیت پلن ناموفق بود.',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
