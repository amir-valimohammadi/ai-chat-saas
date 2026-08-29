<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-unanswered-update-status.php
// هدف: تغییر وضعیت سوال بی‌پاسخ AI، مثل ignored یا reviewed

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
require_role($user, ['customer_admin']);

$input = get_json_input();

$id = isset($input['id']) ? (int) $input['id'] : 0;
$status = trim((string) ($input['status'] ?? ''));

$allowedStatuses = ['new', 'reviewed', 'added_to_knowledge', 'ignored'];

if ($id <= 0) {
    json_response([
        'success' => false,
        'message' => 'Unanswered question ID is required'
    ], 422);
}

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE ai_unanswered_questions
        SET status = :status
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':status' => $status,
        ':id' => $id,
        ':tenant_id' => $user['tenant_id'],
    ]);

    if ($stmt->rowCount() === 0) {
        json_response([
            'success' => false,
            'message' => 'Unanswered question not found'
        ], 404);
    }

    json_response([
        'success' => true,
        'message' => 'Unanswered question status updated successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update unanswered question',
        ...safe_api_exception_context($e)
    ], 500);
}