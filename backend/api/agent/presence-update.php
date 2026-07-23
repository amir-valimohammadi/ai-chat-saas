<?php

// مسیر فایل: ai-chat-saas/backend/api/agent/presence-update.php
// هدف: ثبت آخرین فعالیت پشتیبان / مدیر مشتری برای نمایش Online در ویجت

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/routing.php';

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

    $queueResult = ['processed' => 0, 'assigned' => 0];
    if (in_array($user['role'], ['customer_admin', 'agent'], true)) {
        $queueResult = routing_process_queues_for_user(
            $pdo,
            (int) $user['id'],
            (int) $user['tenant_id'],
            1
        );
    }

    json_response([
        'success' => true,
        'message' => 'Presence updated',
        'last_seen_at' => date('Y-m-d H:i:s'),
        'queue_result' => $queueResult,
    ]);
} catch (Exception $e) {
    $payload = ['success' => false, 'message' => 'Failed to update presence'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}