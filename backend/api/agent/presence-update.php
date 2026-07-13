<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/presence-update.php
// هدف: ثبت آخرین فعالیت پشتیبان / مدیر مشتری برای نمایش Online در ویجت

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

try {
    $stmt = $pdo->prepare("
        UPDATE users
        SET last_seen_at = NOW()
        WHERE id = :id
    ");

    $stmt->execute([
        ':id' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Presence updated',
        'last_seen_at' => date('Y-m-d H:i:s')
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update presence',
        'error' => $e->getMessage()
    ], 500);
}