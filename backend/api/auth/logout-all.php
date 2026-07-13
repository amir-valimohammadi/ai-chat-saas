<?php

// مسیر فایل: ai-chat-saas/backend/api/auth/logout-all.php
// هدف: خروج از همه دستگاه‌ها با باطل کردن همه توکن‌های قبلی کاربر

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

try {
    $stmt = $pdo->prepare("
        UPDATE users
        SET token_version = token_version + 1
        WHERE id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'All sessions have been revoked successfully'
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS_LOGOUT_ALL] ' . $e->getMessage());

    $response = [
        'success' => false,
        'message' => 'Failed to revoke sessions',
    ];

    if (app_debug_enabled()) {
        $response['error'] = $e->getMessage();
    }

    json_response($response, 500);
}