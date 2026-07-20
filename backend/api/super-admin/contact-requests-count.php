<?php

// مسیر فایل: backend/api/super-admin/contact-requests-count.php
// هدف: شمارنده درخواست‌های جدید برای منوی سوپرادمین

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

try {
    $stmt = $pdo->query("\n        SELECT\n            SUM(status = 'new') AS new_count,\n            SUM(status IN ('new', 'reviewing', 'contacted', 'waiting_customer', 'qualified')) AS open_count\n        FROM customer_requests\n    ");
    $row = $stmt->fetch() ?: [];

    json_response([
        'success' => true,
        'new_count' => (int) ($row['new_count'] ?? 0),
        'open_count' => (int) ($row['open_count'] ?? 0),
    ]);
} catch (Throwable $e) {
    error_log('[CONTACT_REQUESTS_COUNT] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'دریافت شمارنده درخواست‌ها ناموفق بود.'], 500);
}
