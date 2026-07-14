<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plans-list.php
// هدف: دریافت پلن‌ها همراه با آمار مشتری، مصرف و هشدار محدودیت

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

try {
    $stmt = $pdo->query("
        SELECT
            plans.id,
            plans.name,
            plans.description,
            plans.max_sites,
            plans.max_agents,
            plans.max_monthly_conversations,
            plans.ai_suggestions_enabled,
            plans.ai_auto_reply_enabled,
            plans.knowledge_base_enabled,
            plans.price_monthly,
            plans.is_active,
            plans.created_at,
            plans.updated_at,
            (SELECT COUNT(*) FROM tenants WHERE tenants.plan_id = plans.id) AS customers_count,
            (SELECT COUNT(*) FROM tenants WHERE tenants.plan_id = plans.id AND tenants.status = 'active') AS active_customers_count,
            (
                SELECT COUNT(*) FROM sites
                INNER JOIN tenants ON tenants.id = sites.tenant_id
                WHERE tenants.plan_id = plans.id
            ) AS total_sites,
            (
                SELECT COUNT(*) FROM users
                INNER JOIN tenants ON tenants.id = users.tenant_id
                WHERE tenants.plan_id = plans.id AND users.role = 'agent'
            ) AS total_agents,
            (
                SELECT COUNT(*) FROM conversations
                INNER JOIN sites ON sites.id = conversations.site_id
                INNER JOIN tenants ON tenants.id = sites.tenant_id
                WHERE tenants.plan_id = plans.id
                  AND conversations.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
            ) AS monthly_conversations_count,
            (
                SELECT COUNT(*) FROM tenants AS tenant_usage
                WHERE tenant_usage.plan_id = plans.id
                  AND (SELECT COUNT(*) FROM sites WHERE sites.tenant_id = tenant_usage.id) > plans.max_sites
            ) AS tenants_over_sites_limit,
            (
                SELECT COUNT(*) FROM tenants AS tenant_usage
                WHERE tenant_usage.plan_id = plans.id
                  AND (
                      SELECT COUNT(*) FROM users
                      WHERE users.tenant_id = tenant_usage.id AND users.role = 'agent'
                  ) > plans.max_agents
            ) AS tenants_over_agents_limit,
            (
                SELECT COUNT(*) FROM tenants AS tenant_usage
                WHERE tenant_usage.plan_id = plans.id
                  AND (
                      SELECT COUNT(*) FROM conversations
                      INNER JOIN sites ON sites.id = conversations.site_id
                      WHERE sites.tenant_id = tenant_usage.id
                        AND conversations.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
                  ) > plans.max_monthly_conversations
            ) AS tenants_over_conversations_limit
        FROM plans
        ORDER BY plans.id ASC
    ");

    $rows = $stmt->fetchAll();
    $plans = [];
    $summary = [
        'total_plans' => 0,
        'active_plans' => 0,
        'inactive_plans' => 0,
        'assigned_customers' => 0,
        'active_customers' => 0,
        'estimated_monthly_revenue' => 0.0,
        'customers_over_any_limit' => 0,
    ];

    foreach ($rows as $row) {
        $plan = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'max_sites' => (int) $row['max_sites'],
            'max_agents' => (int) $row['max_agents'],
            'max_monthly_conversations' => (int) $row['max_monthly_conversations'],
            'ai_suggestions_enabled' => (bool) $row['ai_suggestions_enabled'],
            'ai_auto_reply_enabled' => (bool) $row['ai_auto_reply_enabled'],
            'knowledge_base_enabled' => (bool) $row['knowledge_base_enabled'],
            'price_monthly' => (float) $row['price_monthly'],
            'is_active' => (bool) $row['is_active'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
            'customers_count' => (int) $row['customers_count'],
            'active_customers_count' => (int) $row['active_customers_count'],
            'total_sites' => (int) $row['total_sites'],
            'total_agents' => (int) $row['total_agents'],
            'monthly_conversations_count' => (int) $row['monthly_conversations_count'],
            'tenants_over_sites_limit' => (int) $row['tenants_over_sites_limit'],
            'tenants_over_agents_limit' => (int) $row['tenants_over_agents_limit'],
            'tenants_over_conversations_limit' => (int) $row['tenants_over_conversations_limit'],
        ];

        $plans[] = $plan;
        $summary['total_plans']++;
        $plan['is_active'] ? $summary['active_plans']++ : $summary['inactive_plans']++;
        $summary['assigned_customers'] += $plan['customers_count'];
        $summary['active_customers'] += $plan['active_customers_count'];
        $summary['estimated_monthly_revenue'] += $plan['active_customers_count'] * $plan['price_monthly'];
        $summary['customers_over_any_limit'] += max(
            $plan['tenants_over_sites_limit'],
            $plan['tenants_over_agents_limit'],
            $plan['tenants_over_conversations_limit']
        );
    }

    json_response([
        'success' => true,
        'plans' => $plans,
        'summary' => $summary,
        'generated_at' => date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load plans'];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
