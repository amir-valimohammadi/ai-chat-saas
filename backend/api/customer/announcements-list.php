<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/announcements-list.php
// هدف: دریافت اعلان‌های فعال برای کاربران پنل مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$includeDismissed = isset($_GET['include_dismissed']) && (int) $_GET['include_dismissed'] === 1;

try {
    $dismissedSql = $includeDismissed ? '' : ' AND states.dismissed_at IS NULL ';

    $stmt = $pdo->prepare("
        SELECT
            announcements.id,
            announcements.title,
            announcements.body,
            announcements.image_url,
            announcements.type,
            announcements.priority,
            announcements.target_type,
            announcements.cta_label,
            announcements.cta_url,
            announcements.starts_at,
            announcements.ends_at,
            announcements.is_dismissible,
            announcements.created_at,
            states.read_at,
            states.dismissed_at,
            states.clicked_at
        FROM announcements
        LEFT JOIN announcement_user_states AS states
            ON states.announcement_id = announcements.id
            AND states.user_id = :user_id
        WHERE announcements.is_active = 1
          AND (announcements.starts_at IS NULL OR announcements.starts_at <= NOW())
          AND (announcements.ends_at IS NULL OR announcements.ends_at >= NOW())
          AND (
                announcements.target_type = 'all'
                OR EXISTS (
                    SELECT 1
                    FROM announcement_targets
                    WHERE announcement_targets.announcement_id = announcements.id
                      AND announcement_targets.tenant_id = :tenant_id
                )
          )
          {$dismissedSql}
        ORDER BY
            CASE announcements.priority
                WHEN 'critical' THEN 0
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                ELSE 3
            END,
            announcements.id DESC
        LIMIT 100
    ");

    $stmt->execute([
        ':user_id' => $user['id'],
        ':tenant_id' => $user['tenant_id'],
    ]);

    $announcements = $stmt->fetchAll();

    json_response([
        'success' => true,
        'unread_count' => count(array_filter($announcements, function ($item) {
            return empty($item['read_at']);
        })),
        'announcements' => array_map(function ($item) {
            return [
                'id' => (int) $item['id'],
                'title' => $item['title'],
                'body' => $item['body'],
                'image_url' => $item['image_url'],
                'type' => $item['type'],
                'priority' => $item['priority'],
                'target_type' => $item['target_type'],
                'cta_label' => $item['cta_label'],
                'cta_url' => $item['cta_url'],
                'starts_at' => $item['starts_at'],
                'ends_at' => $item['ends_at'],
                'is_dismissible' => (bool) $item['is_dismissible'],
                'is_read' => !empty($item['read_at']),
                'is_dismissed' => !empty($item['dismissed_at']),
                'read_at' => $item['read_at'],
                'dismissed_at' => $item['dismissed_at'],
                'clicked_at' => $item['clicked_at'],
                'created_at' => $item['created_at'],
            ];
        }, $announcements)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load announcements',
        'error' => $e->getMessage()
    ], 500);
}