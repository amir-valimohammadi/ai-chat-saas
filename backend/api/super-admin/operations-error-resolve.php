<?php

// مسیر فایل: backend/api/super-admin/operations-error-resolve.php
// هدف: حل‌شده/بازکردن مجدد خطاهای مرکز عملیات

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();
$errorId = filter_var($input['error_id'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
$resolved = filter_var($input['resolved'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

if (!$errorId || $resolved === null) {
    json_response(['success' => false, 'message' => 'اطلاعات خطا معتبر نیست.'], 422);
}

try {
    $stmt = $pdo->prepare("SELECT id, message, resolved_at FROM system_error_logs WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $errorId]);
    $error = $stmt->fetch();
    if (!$error) {
        json_response(['success' => false, 'message' => 'خطا پیدا نشد.'], 404);
    }

    $update = $pdo->prepare("
        UPDATE system_error_logs
        SET resolved_at = :resolved_at, resolved_by = :resolved_by
        WHERE id = :id
    ");
    $update->execute([
        ':resolved_at' => $resolved ? date('Y-m-d H:i:s') : null,
        ':resolved_by' => $resolved ? (int) $user['id'] : null,
        ':id' => $errorId,
    ]);

    admin_audit_log(
        $pdo,
        $user,
        $resolved ? 'system.error_resolved' : 'system.error_reopened',
        'system_error',
        (int) $errorId,
        $resolved ? 'خطای سیستم حل‌شده علامت‌گذاری شد.' : 'خطای سیستم دوباره باز شد.',
        ['resolved_at' => $error['resolved_at']],
        ['resolved_at' => $resolved ? date('Y-m-d H:i:s') : null]
    );

    json_response(['success' => true, 'message' => $resolved ? 'خطا حل‌شده ثبت شد.' : 'خطا دوباره باز شد.']);
} catch (Throwable $e) {
    app_log_error($e, ['component' => 'error_resolve', 'status_code' => 500]);
    json_response(['success' => false, 'message' => 'بروزرسانی وضعیت خطا ناموفق بود.'], 500);
}
