<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plan-toggle-status.php
// هدف: فعال / غیرفعال کردن پلن توسط Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$input = get_json_input();

$planId = isset($input['id']) ? (int) $input['id'] : 0;
$isActive = isset($input['is_active']) ? (bool) $input['is_active'] : false;

if ($planId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Plan ID is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE plans
        SET is_active = :is_active
        WHERE id = :id
    ");

    $stmt->execute([
        ':id' => $planId,
        ':is_active' => $isActive ? 1 : 0,
    ]);

    json_response([
        'success' => true,
        'message' => 'Plan status updated',
        'is_active' => $isActive,
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update plan status',
        'error' => $e->getMessage()
    ], 500);
}