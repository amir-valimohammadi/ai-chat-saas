<?php

// مسیر فایل: backend/api/super-admin/operations-maintenance-update.php
// هدف: فعال/غیرفعال‌سازی امن Maintenance Mode و ثبت Audit Log

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/system-settings.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();

if (!array_key_exists('enabled', $input)) {
    json_response(['success' => false, 'message' => 'enabled is required'], 422);
}

$enabled = filter_var($input['enabled'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($enabled === null) {
    json_response(['success' => false, 'message' => 'Invalid enabled value'], 422);
}

$message = trim((string) ($input['message'] ?? 'سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.'));
if ($message === '') {
    $message = 'سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.';
}
$message = mb_substr($message, 0, 500);

$until = trim((string) ($input['until'] ?? ''));
$untilSql = null;
if ($until !== '') {
    $timestamp = strtotime($until);
    if ($timestamp === false || $timestamp <= time()) {
        json_response(['success' => false, 'message' => 'زمان پایان باید در آینده باشد.'], 422);
    }
    $untilSql = date('Y-m-d H:i:s', $timestamp);
}

try {
    $old = [
        'enabled' => (bool) system_setting_get($pdo, 'maintenance_enabled', false),
        'message' => system_setting_get($pdo, 'maintenance_message'),
        'until' => system_setting_get($pdo, 'maintenance_until'),
    ];

    $pdo->beginTransaction();
    system_setting_set($pdo, 'maintenance_enabled', $enabled, 'boolean', (int) $user['id']);
    system_setting_set($pdo, 'maintenance_message', $message, 'string', (int) $user['id']);
    system_setting_set($pdo, 'maintenance_until', $untilSql, 'datetime', (int) $user['id']);

    admin_audit_log(
        $pdo,
        $user,
        $enabled ? 'system.maintenance_enabled' : 'system.maintenance_disabled',
        'system_setting',
        null,
        $enabled ? 'حالت نگهداری سیستم فعال شد.' : 'حالت نگهداری سیستم غیرفعال شد.',
        $old,
        ['enabled' => $enabled, 'message' => $message, 'until' => $untilSql]
    );
    $pdo->commit();

    json_response([
        'success' => true,
        'message' => $enabled ? 'Maintenance Mode فعال شد.' : 'Maintenance Mode غیرفعال شد.',
        'maintenance' => ['enabled' => $enabled, 'message' => $message, 'until' => $untilSql],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    app_log_error($e, ['component' => 'maintenance_update', 'status_code' => 500]);
    json_response(['success' => false, 'message' => 'بروزرسانی حالت نگهداری ناموفق بود.'], 500);
}
