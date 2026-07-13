<?php

// مسیر فایل: ai-chat-saas/backend/api/test-db.php
// هدف: تست اتصال PHP به دیتابیس MySQL و خواندن جدول plans

require_once __DIR__ . '/../includes/cors.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../config/database.php';

try {
    $stmt = $pdo->query("SELECT COUNT(*) AS total FROM plans");
    $result = $stmt->fetch();

    json_response([
        'success' => true,
        'message' => 'Database connected successfully',
        'plans_count' => (int) $result['total']
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Database test failed',
        'error' => $e->getMessage()
    ], 500);
}