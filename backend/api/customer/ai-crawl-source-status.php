<?php

// مسیر فایل: backend/api/customer/ai-crawl-source-status.php
// هدف: فعال/غیرفعال کردن منبع و مدیریت چرخه عمر دانش استخراج‌شده

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-crawl-jobs.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/subscription.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
require_active_subscription($pdo, (int) $user['tenant_id'], 'crawl_source_status');

$input = get_json_input();
$sourceId = isset($input['id']) ? (int) $input['id'] : 0;
$isActive = ai_bool($input['is_active'] ?? false) === 1;

if ($sourceId <= 0) {
    json_response([
        'success' => false,
        'message' => 'شناسه منبع خزش الزامی است.'
    ], 422);
}

try {
    $result = ai_set_crawl_source_status($pdo, $user, $sourceId, $isActive);

    json_response([
        'success' => true,
        'message' => $isActive
            ? 'منبع فعال شد. برای ورود دوباره محتوای آن، خزش را اجرا کنید.'
            : 'منبع غیرفعال شد؛ دانش خودکار آن آرشیو و ویرایش‌های دستی حفظ شدند.',
        'result' => $result,
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'تغییر وضعیت منبع خزش ناموفق بود.',
        'error' => $e->getMessage(),
    ], 500);
}
