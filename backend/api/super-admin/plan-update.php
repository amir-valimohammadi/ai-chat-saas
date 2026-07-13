<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plan-update.php
// هدف: ویرایش پلن توسط Super Admin

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

$planId = isset($input['id']) ? (int) $input['id'] : 0;

$name = trim($input['name'] ?? '');
$description = trim($input['description'] ?? '');

$maxSites = isset($input['max_sites']) ? (int) $input['max_sites'] : 1;
$maxAgents = isset($input['max_agents']) ? (int) $input['max_agents'] : 1;
$maxMonthlyConversations = isset($input['max_monthly_conversations'])
    ? (int) $input['max_monthly_conversations']
    : 30;

$aiSuggestionsEnabled = !empty($input['ai_suggestions_enabled']) ? 1 : 0;
$aiAutoReplyEnabled = !empty($input['ai_auto_reply_enabled']) ? 1 : 0;
$knowledgeBaseEnabled = !empty($input['knowledge_base_enabled']) ? 1 : 0;

$priceMonthly = isset($input['price_monthly']) ? (float) $input['price_monthly'] : 0;
$isActive = isset($input['is_active']) ? (bool) $input['is_active'] : true;

if ($planId <= 0) {
    json_response([
        'success' => false,
        'message' => 'Plan ID is required'
    ], 422);
}

if ($name === '') {
    json_response([
        'success' => false,
        'message' => 'Plan name is required'
    ], 422);
}

if ($maxSites < 1) {
    json_response([
        'success' => false,
        'message' => 'Max sites must be at least 1'
    ], 422);
}

if ($maxAgents < 0) {
    json_response([
        'success' => false,
        'message' => 'Max agents cannot be negative'
    ], 422);
}

if ($maxMonthlyConversations < 0) {
    json_response([
        'success' => false,
        'message' => 'Monthly conversations cannot be negative'
    ], 422);
}

try {
    $planStmt = $pdo->prepare("
        SELECT id
        FROM plans
        WHERE id = :id
        LIMIT 1
    ");

    $planStmt->execute([
        ':id' => $planId,
    ]);

    if (!$planStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'Plan not found'
        ], 404);
    }

    $stmt = $pdo->prepare("
        UPDATE plans
        SET
            name = :name,
            description = :description,
            max_sites = :max_sites,
            max_agents = :max_agents,
            max_monthly_conversations = :max_monthly_conversations,
            ai_suggestions_enabled = :ai_suggestions_enabled,
            ai_auto_reply_enabled = :ai_auto_reply_enabled,
            knowledge_base_enabled = :knowledge_base_enabled,
            price_monthly = :price_monthly,
            is_active = :is_active
        WHERE id = :id
    ");

    $stmt->execute([
        ':id' => $planId,
        ':name' => $name,
        ':description' => $description !== '' ? $description : null,
        ':max_sites' => $maxSites,
        ':max_agents' => $maxAgents,
        ':max_monthly_conversations' => $maxMonthlyConversations,
        ':ai_suggestions_enabled' => $aiSuggestionsEnabled,
        ':ai_auto_reply_enabled' => $aiAutoReplyEnabled,
        ':knowledge_base_enabled' => $knowledgeBaseEnabled,
        ':price_monthly' => $priceMonthly,
        ':is_active' => $isActive ? 1 : 0,
    ]);

    json_response([
        'success' => true,
        'message' => 'Plan updated successfully'
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to update plan',
        'error' => $e->getMessage()
    ], 500);
}