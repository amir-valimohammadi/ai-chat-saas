<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plan-toggle-status.php
// هدف: فعال یا غیرفعال کردن امن پلن توسط Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();

$planId = isset($input['id']) ? (int) $input['id'] : 0;
if ($planId <= 0) {
    json_response(['success' => false, 'message' => 'شناسه پلن الزامی است.'], 422);
}
if (!array_key_exists('is_active', $input)) {
    json_response(['success' => false, 'message' => 'وضعیت پلن الزامی است.'], 422);
}

$isActive = filter_var($input['is_active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($isActive === null) {
    json_response(['success' => false, 'message' => 'وضعیت پلن معتبر نیست.'], 422);
}

try {
    $planStmt = $pdo->prepare("
        SELECT
            plans.id,
            plans.name,
            (SELECT COUNT(*) FROM tenants WHERE tenants.plan_id = plans.id) AS customers_count
        FROM plans
        WHERE plans.id = :id
        LIMIT 1
    ");
    $planStmt->execute([':id' => $planId]);
    $plan = $planStmt->fetch();

    if (!$plan) {
        json_response(['success' => false, 'message' => 'پلن پیدا نشد.'], 404);
    }

    $stmt = $pdo->prepare("UPDATE plans SET is_active = :is_active WHERE id = :id");
    $stmt->execute([
        ':id' => $planId,
        ':is_active' => $isActive ? 1 : 0,
    ]);

    $warning = null;
    if (!$isActive && (int) $plan['customers_count'] > 0) {
        $warning = sprintf(
            'پلن غیرفعال شد. تخصیص فعلی %d مشتری حفظ شده است، اما پلن برای تخصیص جدید قابل انتخاب نیست.',
            (int) $plan['customers_count']
        );
    }

    json_response([
        'success' => true,
        'message' => 'وضعیت پلن تغییر کرد.',
        'is_active' => $isActive,
        'warning' => $warning,
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'تغییر وضعیت پلن ناموفق بود.'];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
