<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

if (!automation_tables_ready($pdo)) {
    json_response(['success' => false, 'message' => 'جداول مرکز اتوماسیون هنوز نصب نشده‌اند.'], 503);
}

try {
    $startedAt = microtime(true);
    $result = automation_run_scheduled($pdo, 250, (int) $user['tenant_id']);
    $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

    json_response([
        'success' => true,
        'message' => 'بررسی زمان‌بندی‌شده برای فضای کاری شما انجام شد.',
        'duration_ms' => $durationMs,
        'result' => $result,
    ]);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'اجرای بررسی اتوماسیون ناموفق بود.'], 500);
}
