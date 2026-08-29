<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/announcement-update.php
// هدف: ویرایش اعلان توسط سوپر ادمین

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
$title = trim($input['title'] ?? '');
$body = trim($input['body'] ?? '');
$imageUrl = trim($input['image_url'] ?? '');
$type = trim($input['type'] ?? 'info');
$priority = trim($input['priority'] ?? 'medium');
$targetType = trim($input['target_type'] ?? 'all');
$tenantIds = $input['tenant_ids'] ?? [];
$ctaLabel = trim($input['cta_label'] ?? '');
$ctaUrl = trim($input['cta_url'] ?? '');
$startsAt = trim($input['starts_at'] ?? '');
$endsAt = trim($input['ends_at'] ?? '');
$isActive = isset($input['is_active']) ? (int) (bool) $input['is_active'] : 1;
$isDismissible = isset($input['is_dismissible']) ? (int) (bool) $input['is_dismissible'] : 1;

$allowedTypes = ['info', 'warning', 'discount', 'update', 'danger'];
$allowedPriorities = ['low', 'medium', 'high', 'critical'];
$allowedTargets = ['all', 'selected'];

if ($announcementId <= 0) {
    json_response([
        'success' => false,
        'message' => 'id is required'
    ], 422);
}

if ($title === '' || $body === '') {
    json_response([
        'success' => false,
        'message' => 'title and body are required'
    ], 422);
}

if (!in_array($type, $allowedTypes, true) || !in_array($priority, $allowedPriorities, true) || !in_array($targetType, $allowedTargets, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid announcement data'
    ], 422);
}

if (!is_array($tenantIds)) {
    $tenantIds = [];
}

$tenantIds = array_values(array_unique(array_filter(array_map('intval', $tenantIds))));

if ($targetType === 'selected' && count($tenantIds) === 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_ids are required for selected target'
    ], 422);
}

try {
    $pdo->beginTransaction();

    $checkStmt = $pdo->prepare("
        SELECT id
        FROM announcements
        WHERE id = :id
        LIMIT 1
    ");

    $checkStmt->execute([
        ':id' => $announcementId,
    ]);

    if (!$checkStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Announcement not found'
        ], 404);
    }

    if ($targetType === 'selected') {
        $placeholders = implode(',', array_fill(0, count($tenantIds), '?'));

        $tenantCheckStmt = $pdo->prepare("
            SELECT id
            FROM tenants
            WHERE id IN ($placeholders)
        ");

        $tenantCheckStmt->execute($tenantIds);
        $existingTenantIds = array_map('intval', array_column($tenantCheckStmt->fetchAll(), 'id'));

        if (count($existingTenantIds) !== count($tenantIds)) {
            json_response([
                'success' => false,
                'message' => 'One or more selected customers are invalid'
            ], 422);
        }
    }

    $stmt = $pdo->prepare("
        UPDATE announcements
        SET
            title = :title,
            body = :body,
            image_url = :image_url,
            type = :type,
            priority = :priority,
            target_type = :target_type,
            cta_label = :cta_label,
            cta_url = :cta_url,
            starts_at = :starts_at,
            ends_at = :ends_at,
            is_active = :is_active,
            is_dismissible = :is_dismissible
        WHERE id = :id
    ");

    $stmt->execute([
        ':title' => $title,
        ':body' => $body,
        ':image_url' => $imageUrl !== '' ? $imageUrl : null,
        ':type' => $type,
        ':priority' => $priority,
        ':target_type' => $targetType,
        ':cta_label' => $ctaLabel !== '' ? $ctaLabel : null,
        ':cta_url' => $ctaUrl !== '' ? $ctaUrl : null,
        ':starts_at' => $startsAt !== '' ? $startsAt : null,
        ':ends_at' => $endsAt !== '' ? $endsAt : null,
        ':is_active' => $isActive,
        ':is_dismissible' => $isDismissible,
        ':id' => $announcementId,
    ]);

    $deleteTargetsStmt = $pdo->prepare("
        DELETE FROM announcement_targets
        WHERE announcement_id = :announcement_id
    ");

    $deleteTargetsStmt->execute([
        ':announcement_id' => $announcementId,
    ]);

    if ($targetType === 'selected') {
        $targetStmt = $pdo->prepare("
            INSERT INTO announcement_targets (
                announcement_id,
                tenant_id
            ) VALUES (
                :announcement_id,
                :tenant_id
            )
        ");

        foreach ($tenantIds as $tenantId) {
            $targetStmt->execute([
                ':announcement_id' => $announcementId,
                ':tenant_id' => $tenantId,
            ]);
        }
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Announcement updated successfully'
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to update announcement',
        ...safe_api_exception_context($e)
    ], 500);
}