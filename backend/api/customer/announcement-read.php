<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/announcement-read.php
// هدف: ثبت خوانده‌شدن اعلان برای کاربر مشتری

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
require_role($user, ['customer_admin', 'agent']);

$input = get_json_input();
$announcementId = isset($input['announcement_id']) ? (int) $input['announcement_id'] : 0;

if ($announcementId <= 0) {
    json_response([
        'success' => false,
        'message' => 'announcement_id is required'
    ], 422);
}

try {
    $checkStmt = $pdo->prepare("
        SELECT id
        FROM announcements
        WHERE id = :announcement_id
          AND is_active = 1
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at >= NOW())
          AND (
                target_type = 'all'
                OR EXISTS (
                    SELECT 1
                    FROM announcement_targets
                    WHERE announcement_targets.announcement_id = announcements.id
                      AND announcement_targets.tenant_id = :tenant_id
                )
          )
        LIMIT 1
    ");

    $checkStmt->execute([
        ':announcement_id' => $announcementId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    if (!$checkStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Announcement not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        INSERT INTO announcement_user_states (
            announcement_id,
            tenant_id,
            user_id,
            read_at
        ) VALUES (
            :announcement_id,
            :tenant_id,
            :user_id,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            read_at = COALESCE(read_at, NOW()),
            updated_at = NOW()
    ");

    $stmt->execute([
        ':announcement_id' => $announcementId,
        ':tenant_id' => $user['tenant_id'],
        ':user_id' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Announcement marked as read'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to mark announcement as read',
        ...safe_api_exception_context($e)
    ], 500);
}