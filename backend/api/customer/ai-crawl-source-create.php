<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-crawl-source-create.php
// هدف: ثبت یا به‌روزرسانی منبع مجاز خزش AI برای سایت مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
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

$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;
$sourceType = trim((string) ($input['source_type'] ?? 'url'));
$sourceValue = trim((string) ($input['source_value'] ?? ''));
$label = ai_trim_or_null($input['label'] ?? null, 255);
$categoryHint = ai_trim_or_null($input['category_hint'] ?? null, 120);
$isActive = array_key_exists('is_active', $input) ? ai_bool($input['is_active']) : 1;

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);
    $sourceValue = ai_validate_crawl_source($sourceType, $sourceValue, $site['domain']);

    $existingStmt = $pdo->prepare(" 
        SELECT id
        FROM ai_crawl_sources
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
          AND source_type = :source_type
          AND source_value = :source_value
        LIMIT 1
    ");

    $existingStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
        ':source_type' => $sourceType,
        ':source_value' => $sourceValue,
    ]);

    $existing = $existingStmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare(" 
            UPDATE ai_crawl_sources
            SET
                label = :label,
                category_hint = :category_hint,
                is_active = :is_active,
                created_by = :created_by
            WHERE id = :id
              AND tenant_id = :tenant_id
        ");

        $stmt->execute([
            ':label' => $label,
            ':category_hint' => $categoryHint,
            ':is_active' => $isActive,
            ':created_by' => $user['id'],
            ':id' => $existing['id'],
            ':tenant_id' => $user['tenant_id'],
        ]);

        json_response([
            'success' => true,
            'message' => 'AI crawl source updated successfully',
            'item_id' => (int) $existing['id']
        ]);
    }

    $stmt = $pdo->prepare(" 
        INSERT INTO ai_crawl_sources (
            tenant_id,
            site_id,
            source_type,
            source_value,
            label,
            category_hint,
            is_active,
            created_by
        ) VALUES (
            :tenant_id,
            :site_id,
            :source_type,
            :source_value,
            :label,
            :category_hint,
            :is_active,
            :created_by
        )
    ");

    $stmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
        ':source_type' => $sourceType,
        ':source_value' => $sourceValue,
        ':label' => $label,
        ':category_hint' => $categoryHint,
        ':is_active' => $isActive,
        ':created_by' => $user['id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'AI crawl source created successfully',
        'item_id' => (int) $pdo->lastInsertId()
    ], 201);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to save AI crawl source',
        'error' => $e->getMessage()
    ], 500);
}