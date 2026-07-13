<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/announcement-delete.php
// هدف: غیرفعال کردن اعلان توسط سوپر ادمین

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
$announcementId = isset($input['id']) ? (int) $input['id'] : 0;

if ($announcementId <= 0) {
    json_response([
        'success' => false,
        'message' => 'id is required'
    ], 422);
}

try {
    $stmt = $pdo->prepare("
        UPDATE announcements
        SET is_active = 0
        WHERE id = :id
    ");

    $stmt->execute([
        ':id' => $announcementId,
    ]);

    json_response([
        'success' => true,
        'message' => 'Announcement disabled successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to disable announcement',
        'error' => $e->getMessage()
    ], 500);
}