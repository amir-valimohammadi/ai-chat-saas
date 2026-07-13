<?php

// مسیر فایل: ai-chat-saas/backend/api/widget/conversation-start.php
// هدف: ایجاد یا بازیابی گفتگوی فعال برای بازدیدکننده + کنترل Origin + محدودسازی ورودی‌ها

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/rate-limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$input = get_json_input();

$siteKey = trim($input['site_key'] ?? '');
$visitorId = isset($input['visitor_id']) ? (int) $input['visitor_id'] : 0;
$sourcePageUrl = trim($input['source_page_url'] ?? '');
$sourcePageTitle = trim($input['source_page_title'] ?? '');

if ($siteKey === '' || $visitorId <= 0) {
    json_response([
        'success' => false,
        'message' => 'site_key and visitor_id are required'
    ], 422);
}

if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response([
        'success' => false,
        'message' => 'Invalid site_key'
    ], 422);
}

if (mb_strlen($sourcePageUrl, 'UTF-8') > 1000) {
    json_response([
        'success' => false,
        'message' => 'Source page URL is too long'
    ], 422);
}

if (mb_strlen($sourcePageTitle, 'UTF-8') > 255) {
    json_response([
        'success' => false,
        'message' => 'Source page title is too long'
    ], 422);
}

if ($sourcePageUrl !== '') {
    $sourceScheme = strtolower((string) parse_url($sourcePageUrl, PHP_URL_SCHEME));

    if (!filter_var($sourcePageUrl, FILTER_VALIDATE_URL) || !in_array($sourceScheme, ['http', 'https'], true)) {
        $sourcePageUrl = '';
    }
}

enforce_rate_limit(
    $pdo,
    'widget_conversation_start',
    rate_limit_identifier($siteKey . '|' . $visitorId . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    10,
    10 * 60,
    'Too many conversations started. Please try again later.'
);

try {
    $siteStmt = $pdo->prepare("
        SELECT
            sites.id,
            sites.domain
        FROM sites
        INNER JOIN tenants ON tenants.id = sites.tenant_id
        WHERE sites.site_key = :site_key
          AND sites.is_active = 1
          AND tenants.status = 'active'
        LIMIT 1
    ");

    $siteStmt->execute([
        ':site_key' => $siteKey
    ]);

    $site = $siteStmt->fetch();

    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    validate_widget_origin_or_fail($site['domain']);

    $siteId = (int) $site['id'];

    $visitorStmt = $pdo->prepare("
        SELECT id
        FROM visitors
        WHERE id = :visitor_id
          AND site_id = :site_id
        LIMIT 1
    ");

    $visitorStmt->execute([
        ':visitor_id' => $visitorId,
        ':site_id' => $siteId
    ]);

    if (!$visitorStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Visitor not found'
        ], 404);
    }

    $conversationStmt = $pdo->prepare("
        SELECT id, status
        FROM conversations
        WHERE site_id = :site_id
          AND visitor_id = :visitor_id
          AND status IN (
              'new',
              'open',
              'in_progress',
              'waiting_customer',
              'follow_up',
              'pending'
          )
        ORDER BY id DESC
        LIMIT 1
    ");

    $conversationStmt->execute([
        ':site_id' => $siteId,
        ':visitor_id' => $visitorId
    ]);

    $conversation = $conversationStmt->fetch();

    if ($conversation) {
        $conversationId = (int) $conversation['id'];

        $updateStmt = $pdo->prepare("
            UPDATE conversations
            SET
                source_page_url = COALESCE(NULLIF(:source_page_url, ''), source_page_url),
                source_page_title = COALESCE(NULLIF(:source_page_title, ''), source_page_title)
            WHERE id = :id
        ");

        $updateStmt->execute([
            ':source_page_url' => $sourcePageUrl,
            ':source_page_title' => $sourcePageTitle,
            ':id' => $conversationId,
        ]);
    } else {
        ensure_monthly_conversation_limit($pdo, $siteId);

        $insertStmt = $pdo->prepare("
            INSERT INTO conversations (
                site_id,
                visitor_id,
                status,
                source_page_url,
                source_page_title,
                last_message_at
            ) VALUES (
                :site_id,
                :visitor_id,
                'new',
                :source_page_url,
                :source_page_title,
                NOW()
            )
        ");

        $insertStmt->execute([
            ':site_id' => $siteId,
            ':visitor_id' => $visitorId,
            ':source_page_url' => $sourcePageUrl !== '' ? $sourcePageUrl : null,
            ':source_page_title' => $sourcePageTitle !== '' ? $sourcePageTitle : null,
        ]);

        $conversationId = (int) $pdo->lastInsertId();
    }

    json_response([
        'success' => true,
        'conversation' => [
            'id' => $conversationId,
            'site_id' => $siteId,
            'visitor_id' => $visitorId,
        ]
    ]);
} catch (Exception $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to start conversation',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}