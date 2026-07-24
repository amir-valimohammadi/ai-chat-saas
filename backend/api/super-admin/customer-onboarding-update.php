<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();

$itemId = filter_var(
    $input['item_id'] ?? 0,
    FILTER_VALIDATE_INT,
    ['options' => ['default' => 0, 'min_range' => 1]]
);
$status = (string) ($input['status'] ?? 'pending');
$dueAt = trim((string) ($input['due_at'] ?? ''));

if ($itemId <= 0 || !in_array($status, ['pending', 'in_progress', 'done', 'skipped'], true)) {
    json_response(['success' => false, 'message' => 'اطلاعات چک‌لیست معتبر نیست.'], 422);
}
if ($dueAt !== '' && strtotime($dueAt) === false) {
    json_response(['success' => false, 'message' => 'تاریخ سررسید معتبر نیست.'], 422);
}

$normalizedDueAt = $dueAt !== '' ? date('Y-m-d H:i:s', strtotime($dueAt)) : null;
$completed = in_array($status, ['done', 'skipped'], true);

try {
    $stmt = $pdo->prepare(
        'SELECT oi.*, t.name AS tenant_name
         FROM tenant_onboarding_items oi
         INNER JOIN tenants t ON t.id = oi.tenant_id
         WHERE oi.id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $itemId]);
    $item = $stmt->fetch();
    if (!$item) {
        json_response(['success' => false, 'message' => 'آیتم پیدا نشد.'], 404);
    }

    if ($completed) {
        $update = $pdo->prepare(
            'UPDATE tenant_onboarding_items
             SET status = :status,
                 due_at = :due_at,
                 completed_at = COALESCE(completed_at, NOW()),
                 completed_by = :actor
             WHERE id = :id'
        );
        $update->execute([
            ':status' => $status,
            ':due_at' => $normalizedDueAt,
            ':actor' => (int) $user['id'],
            ':id' => $itemId,
        ]);
    } else {
        $update = $pdo->prepare(
            'UPDATE tenant_onboarding_items
             SET status = :status,
                 due_at = :due_at,
                 completed_at = NULL,
                 completed_by = NULL
             WHERE id = :id'
        );
        $update->execute([
            ':status' => $status,
            ':due_at' => $normalizedDueAt,
            ':id' => $itemId,
        ]);
    }

    admin_audit_log(
        $pdo,
        $user,
        'customer.onboarding_updated',
        'tenant_onboarding',
        $itemId,
        'چک‌لیست راه‌اندازی مشتری «' . $item['tenant_name'] . '» بروزرسانی شد.',
        ['status' => $item['status'], 'due_at' => $item['due_at']],
        ['status' => $status, 'due_at' => $normalizedDueAt],
        ['tenant_id' => (int) $item['tenant_id']]
    );

    json_response(['success' => true, 'message' => 'چک‌لیست بروزرسانی شد.']);
} catch (Throwable $e) {
    error_log('[CUSTOMER_ONBOARDING_UPDATE] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'بروزرسانی چک‌لیست ناموفق بود.'], 500);
}
