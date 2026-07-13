<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/presence-status.php
// هدف: دریافت و تغییر وضعیت دستی آنلاین/آفلاین پشتیبان

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare("
        SELECT availability_status, last_seen_at
        FROM users
        WHERE id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $user['id'],
    ]);

    $data = $stmt->fetch();

    json_response([
        'success' => true,
        'availability_status' => $data['availability_status'] ?? 'online',
        'last_seen_at' => $data['last_seen_at'] ?? null,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$input = get_json_input();

$status = trim($input['availability_status'] ?? '');

$allowedStatuses = ['online', 'offline'];

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid availability status'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE users
        SET
            availability_status = :availability_status,
            last_seen_at = CASE
                WHEN :availability_status = 'online' THEN NOW()
                ELSE last_seen_at
            END
        WHERE id = :id
    ");

    $stmt->execute([
        ':availability_status' => $status,
        ':id' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Presence status updated',
        'availability_status' => $status,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update presence status',
        'error' => $e->getMessage()
    ], 500);
}