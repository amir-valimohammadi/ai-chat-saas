<?php

// مسیر فایل: backend/api/customer/ai-crawl-source-delete.php
// سازگاری با نسخه‌های قبلی: غیرفعال‌سازی منبع همراه با آرشیو دانش خودکار

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-crawl-jobs.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$itemId = isset($input['id']) ? (int) $input['id'] : 0;

if ($itemId <= 0) {
    json_response(['success' => false, 'message' => 'شناسه منبع خزش الزامی است.'], 422);
}

try {
    $result = ai_set_crawl_source_status($pdo, $user, $itemId, false);

    json_response([
        'success' => true,
        'message' => 'منبع غیرفعال شد؛ دانش خودکار آرشیو و ویرایش‌های دستی حفظ شدند.',
        'result' => $result,
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'غیرفعال کردن منبع ناموفق بود.',
        'error' => $e->getMessage(),
    ], 500);
}
