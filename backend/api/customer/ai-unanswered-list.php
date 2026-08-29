<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-unanswered-list.php
// هدف: دریافت سوالاتی که AI نتوانسته با اطمینان کافی جواب بدهد

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;
$status = isset($_GET['status']) ? trim((string) $_GET['status']) : 'new';
$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;

$allowedStatuses = ['new', 'reviewed', 'added_to_knowledge', 'ignored'];

if (!in_array($status, $allowedStatuses, true)) {
    $status = 'new';
}

if ($limit < 1) {
    $limit = 20;
}

if ($limit > 100) {
    $limit = 100;
}

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);

    $stmt = $pdo->prepare("
        SELECT
            id,
            conversation_id,
            message_id,
            question,
            normalized_question,
            occurrence_count,
            first_seen_at,
            last_seen_at,
            failure_reason,
            detected_category,
            detected_intent,
            best_match_score,
            best_sources_json,
            status,
            created_at,
            updated_at
        FROM ai_unanswered_questions
        WHERE tenant_id = :tenant_id
          AND site_id = :site_id
          AND status = :status
        ORDER BY occurrence_count DESC, last_seen_at DESC, id DESC
        LIMIT {$limit}
    ");

    $stmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
        ':status' => $status,
    ]);

    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'site' => [
            'id' => (int) $site['id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
        ],
        'items' => array_map(function ($item) {
            $sources = [];

            if (!empty($item['best_sources_json'])) {
                $decoded = json_decode($item['best_sources_json'], true);
                $sources = is_array($decoded) ? $decoded : [];
            }

            return [
                'id' => (int) $item['id'],
                'conversation_id' => $item['conversation_id'] !== null ? (int) $item['conversation_id'] : null,
                'message_id' => $item['message_id'] !== null ? (int) $item['message_id'] : null,
                'question' => $item['question'],
                'normalized_question' => $item['normalized_question'],
                'occurrence_count' => (int) $item['occurrence_count'],
                'first_seen_at' => $item['first_seen_at'],
                'last_seen_at' => $item['last_seen_at'],
                'failure_reason' => $item['failure_reason'],
                'detected_category' => $item['detected_category'],
                'detected_intent' => $item['detected_intent'],
                'best_match_score' => (float) $item['best_match_score'],
                'best_sources' => $sources,
                'status' => $item['status'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
            ];
        }, $items)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load unanswered questions',
        ...safe_api_exception_context($e)
    ], 500);
}