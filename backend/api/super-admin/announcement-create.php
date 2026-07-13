<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/announcement-create.php
// هدف: ساخت اعلان عمومی یا خصوصی توسط سوپر ادمین

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

if ($title === '' || $body === '') {
    json_response([
        'success' => false,
        'message' => 'title and body are required'
    ], 422);
}

if (mb_strlen($title, 'UTF-8') > 190) {
    json_response([
        'success' => false,
        'message' => 'Title is too long'
    ], 422);
}

if (mb_strlen($body, 'UTF-8') > 5000) {
    json_response([
        'success' => false,
        'message' => 'Body is too long'
    ], 422);
}

if (!in_array($type, $allowedTypes, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid announcement type'
    ], 422);
}

if (!in_array($priority, $allowedPriorities, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid priority'
    ], 422);
}

if (!in_array($targetType, $allowedTargets, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid target_type'
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

$startsAtValue = $startsAt !== '' ? $startsAt : null;
$endsAtValue = $endsAt !== '' ? $endsAt : null;

try {
    $pdo->beginTransaction();

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
        INSERT INTO announcements (
            title,
            body,
            image_url,                       
            type,
            priority,
            target_type,
            cta_label,
            cta_url,
            starts_at,
            ends_at,
            is_active,
            is_dismissible,
            created_by
        ) VALUES (
            :title,
            :body,
            :image_url,      
            :type,
            :priority,
            :target_type,
            :cta_label,
            :cta_url,
            :starts_at,
            :ends_at,
            :is_active,
            :is_dismissible,
            :created_by
        )
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
        ':starts_at' => $startsAtValue,
        ':ends_at' => $endsAtValue,
        ':is_active' => $isActive,
        ':is_dismissible' => $isDismissible,
        ':created_by' => $user['id'],
    ]);

    $announcementId = (int) $pdo->lastInsertId();

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
        'message' => 'Announcement created successfully',
        'announcement_id' => $announcementId,
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to create announcement',
        'error' => $e->getMessage()
    ], 500);
}