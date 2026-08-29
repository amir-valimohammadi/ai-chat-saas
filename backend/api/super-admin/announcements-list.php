<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/announcements-list.php
// هدف: لیست اعلان‌ها برای سوپر ادمین همراه با مخاطب‌های انتخاب‌شده

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
require_role($user, ['super_admin']);

try {
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
            announcements.is_active,
            announcements.is_dismissible,
            announcements.created_at,
            announcements.updated_at,
            users.name AS created_by_name,
            (
                SELECT COUNT(*)
                FROM announcement_targets
                WHERE announcement_targets.announcement_id = announcements.id
            ) AS target_count,
            (
                SELECT COUNT(*)
                FROM announcement_user_states
                WHERE announcement_user_states.announcement_id = announcements.id
                  AND announcement_user_states.read_at IS NOT NULL
            ) AS read_count,
            (
                SELECT COUNT(*)
                FROM announcement_user_states
                WHERE announcement_user_states.announcement_id = announcements.id
                  AND announcement_user_states.dismissed_at IS NOT NULL
            ) AS dismissed_count
        FROM announcements
        LEFT JOIN users ON users.id = announcements.created_by
        ORDER BY announcements.id DESC
        LIMIT 200
    ");

    $stmt->execute();
    $announcements = $stmt->fetchAll();

    $announcementIds = array_map(function ($item) {
        return (int) $item['id'];
    }, $announcements);

    $targetsByAnnouncement = [];

    if (count($announcementIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($announcementIds), '?'));

        $targetsStmt = $pdo->prepare("
            SELECT
                announcement_targets.announcement_id,
                tenants.id AS tenant_id,
                tenants.name AS tenant_name
            FROM announcement_targets
            INNER JOIN tenants ON tenants.id = announcement_targets.tenant_id
            WHERE announcement_targets.announcement_id IN ($placeholders)
            ORDER BY tenants.name ASC
        ");

        $targetsStmt->execute($announcementIds);

        foreach ($targetsStmt->fetchAll() as $target) {
            $announcementId = (int) $target['announcement_id'];

            if (!isset($targetsByAnnouncement[$announcementId])) {
                $targetsByAnnouncement[$announcementId] = [];
            }

            $targetsByAnnouncement[$announcementId][] = [
                'id' => (int) $target['tenant_id'],
                'name' => $target['tenant_name'],
            ];
        }
    }

    json_response([
        'success' => true,
        'announcements' => array_map(function ($item) use ($targetsByAnnouncement) {
            $announcementId = (int) $item['id'];

            return [
                'id' => $announcementId,
                'title' => $item['title'],
                'body' => $item['body'],
                'image_url' => $item['image_url'],
                'type' => $item['type'],
                'priority' => $item['priority'],
                'target_type' => $item['target_type'],
                'target_tenants' => $targetsByAnnouncement[$announcementId] ?? [],
                'cta_label' => $item['cta_label'],
                'cta_url' => $item['cta_url'],
                'starts_at' => $item['starts_at'],
                'ends_at' => $item['ends_at'],
                'is_active' => (bool) $item['is_active'],
                'is_dismissible' => (bool) $item['is_dismissible'],
                'created_by_name' => $item['created_by_name'],
                'target_count' => (int) $item['target_count'],
                'read_count' => (int) $item['read_count'],
                'dismissed_count' => (int) $item['dismissed_count'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
            ];
        }, $announcements)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load announcements',
        ...safe_api_exception_context($e)
    ], 500);
}