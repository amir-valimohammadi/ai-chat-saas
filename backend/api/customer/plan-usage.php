<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/plan-usage.php
// هدف: نمایش یکپارچه پلن و مصرف واقعی محدودیت‌ها

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$tenantId = (int) $user['tenant_id'];

try {
    $plan = get_tenant_plan_limits($pdo, $tenantId, false);
    $usage = get_tenant_plan_usage($pdo, $tenantId);

    json_response([
        'success' => true,
        'customer' => [
            'id' => $plan['tenant_id'],
            'name' => $plan['tenant_name'],
            'status' => $plan['tenant_status'],
        ],
        'plan' => [
            'id' => $plan['plan_id'],
            'name' => $plan['plan_name'],
            'description' => $plan['plan_description'],
            'price_monthly' => $plan['price_monthly'],
            'is_active' => $plan['plan_is_active'],
            'assigned' => $plan['plan_id'] !== null,
            'limits' => [
                'max_sites' => $plan['max_sites'],
                'max_agents' => $plan['max_agents'],
                'max_monthly_conversations' => $plan['max_monthly_conversations'],
            ],
            'features' => [
                'knowledge_base_enabled' => $plan['knowledge_base_enabled'],
                'ai_suggestions_enabled' => $plan['ai_suggestions_enabled'],
                'ai_auto_reply_enabled' => $plan['ai_auto_reply_enabled'],
            ],
        ],
        'usage' => [
            'sites' => build_plan_usage_item(
                (int) $usage['sites'],
                (int) $plan['max_sites']
            ),
            'agents' => array_merge(
                build_plan_usage_item(
                    (int) $usage['agents'],
                    (int) $plan['max_agents']
                ),
                [
                    'active' => (int) $usage['active_agents'],
                ]
            ),
            'monthly_conversations' => build_plan_usage_item(
                (int) $usage['monthly_conversations'],
                (int) $plan['max_monthly_conversations']
            ),
            'knowledge_items' => [
                'used' => (int) $usage['knowledge_items'],
            ],
            'ai_suggestions_this_month' => [
                'used' => (int) $usage['monthly_ai_suggestions'],
            ],
            'ai_auto_replies_this_month' => [
                'used' => (int) $usage['monthly_ai_auto_replies'],
            ],
        ],
        'period' => [
            'month_start' => date('Y-m-01 00:00:00'),
            'now' => date('Y-m-d H:i:s'),
        ],
    ]);
} catch (Throwable $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to load plan usage',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
