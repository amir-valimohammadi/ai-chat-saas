<?php

// مسیر فایل: ai-chat-saas/backend/api/test-db.php
// هدف: تست اتصال PHP به دیتابیس MySQL و خواندن جدول plans فقط در محیط توسعه

require_once __DIR__ . '/../includes/cors.php';
require_once __DIR__ . '/../includes/response.php';

if (app_is_production()) {
    json_response(['success' => false, 'message' => 'Not found'], 404);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth.php';

$user = require_auth($pdo);
require_role($user, ['super_admin']);

try {
    $stmt = $pdo->query('SELECT COUNT(*) AS total FROM plans');
    $result = $stmt->fetch();

    json_response([
        'success' => true,
        'message' => 'Database connected successfully',
        'plans_count' => (int) $result['total'],
    ]);
} catch (Throwable $e) {
    if (function_exists('app_log_error')) {
        app_log_error($e, ['component' => 'test_db', 'status_code' => 500]);
    }

    json_response([
        'success' => false,
        'message' => 'Database test failed',
    ], 500);
}
