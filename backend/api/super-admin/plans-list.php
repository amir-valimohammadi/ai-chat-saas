<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plans-list.php
// هدف: دریافت لیست پلن‌ها برای Super Admin

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
    $stmt = $pdo->query("
        SELECT
            id,
            name,
            description,
            max_sites,
            max_agents,
            max_monthly_conversations,
            ai_suggestions_enabled,
            ai_auto_reply_enabled,
            knowledge_base_enabled,
            price_monthly,
            is_active,
            created_at
        FROM plans
        ORDER BY id ASC
    ");

    $plans = $stmt->fetchAll();

    json_response([
        'success' => true,
        'plans' => array_map(function ($plan) {
            return [
                'id' => (int) $plan['id'],
                'name' => $plan['name'],
                'description' => $plan['description'],
                'max_sites' => (int) $plan['max_sites'],
                'max_agents' => (int) $plan['max_agents'],
                'max_monthly_conversations' => (int) $plan['max_monthly_conversations'],
                'ai_suggestions_enabled' => (bool) $plan['ai_suggestions_enabled'],
                'ai_auto_reply_enabled' => (bool) $plan['ai_auto_reply_enabled'],
                'knowledge_base_enabled' => (bool) $plan['knowledge_base_enabled'],
                'price_monthly' => (float) $plan['price_monthly'],
                'is_active' => (bool) $plan['is_active'],
                'created_at' => $plan['created_at'],
            ];
        }, $plans)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load plans',
        'error' => $e->getMessage()
    ], 500);
}