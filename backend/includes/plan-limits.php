<?php

// مسیر فایل: ai-chat-saas/backend/includes/plan-limits.php
// هدف: دریافت و اعمال محدودیت‌های پلن مشتری

require_once __DIR__ . '/response.php';

function get_tenant_plan_limits(PDO $pdo, int $tenantId): array
{
    $stmt = $pdo->prepare("
        SELECT
            tenants.id AS tenant_id,
            tenants.status AS tenant_status,
            plans.id AS plan_id,
            plans.name AS plan_name,
            plans.max_sites,
            plans.max_agents,
            plans.max_monthly_conversations,
            plans.ai_suggestions_enabled,
            plans.ai_auto_reply_enabled,
            plans.knowledge_base_enabled,
            plans.is_active AS plan_is_active
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        WHERE tenants.id = :tenant_id
        LIMIT 1
    ");

    $stmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $plan = $stmt->fetch();

    if (!$plan) {
        json_response([
            'success' => false,
            'message' => 'Customer not found'
        ], 404);
    }

    if ($plan['tenant_status'] !== 'active') {
        json_response([
            'success' => false,
            'message' => 'Customer account is not active'
        ], 403);
    }

    if (!$plan['plan_id']) {
        json_response([
            'success' => false,
            'message' => 'Customer does not have an assigned plan'
        ], 403);
    }

    if (!(bool) $plan['plan_is_active']) {
        json_response([
            'success' => false,
            'message' => 'Customer plan is not active'
        ], 403);
    }

    return [
        'tenant_id' => (int) $plan['tenant_id'],
        'plan_id' => (int) $plan['plan_id'],
        'plan_name' => $plan['plan_name'],
        'max_sites' => (int) $plan['max_sites'],
        'max_agents' => (int) $plan['max_agents'],
        'max_monthly_conversations' => (int) $plan['max_monthly_conversations'],
        'ai_suggestions_enabled' => (bool) $plan['ai_suggestions_enabled'],
        'ai_auto_reply_enabled' => (bool) $plan['ai_auto_reply_enabled'],
        'knowledge_base_enabled' => (bool) $plan['knowledge_base_enabled'],
    ];
}

function get_site_plan_limits(PDO $pdo, int $siteId): array
{
    $stmt = $pdo->prepare("
        SELECT tenant_id
        FROM sites
        WHERE id = :site_id
        LIMIT 1
    ");

    $stmt->execute([
        ':site_id' => $siteId,
    ]);

    $site = $stmt->fetch();

    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'Site not found'
        ], 404);
    }

    return get_tenant_plan_limits($pdo, (int) $site['tenant_id']);
}

function require_plan_feature(PDO $pdo, int $tenantId, string $featureKey, string $featureLabel): void
{
    $plan = get_tenant_plan_limits($pdo, $tenantId);

    if (empty($plan[$featureKey])) {
        json_response([
            'success' => false,
            'message' => "{$featureLabel} is not available in the current plan"
        ], 403);
    }
}

function require_site_plan_feature(PDO $pdo, int $siteId, string $featureKey, string $featureLabel): void
{
    $plan = get_site_plan_limits($pdo, $siteId);

    if (empty($plan[$featureKey])) {
        json_response([
            'success' => false,
            'message' => "{$featureLabel} is not available in the current plan"
        ], 403);
    }
}

function ensure_monthly_conversation_limit(PDO $pdo, int $siteId): void
{
    $plan = get_site_plan_limits($pdo, $siteId);

    $maxMonthly = (int) $plan['max_monthly_conversations'];

    if ($maxMonthly <= 0) {
        json_response([
            'success' => false,
            'message' => 'Monthly conversations are not available in the current plan'
        ], 403);
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM conversations
        WHERE site_id IN (
            SELECT id
            FROM sites
            WHERE tenant_id = :tenant_id
        )
          AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
          AND created_at < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'), INTERVAL 1 MONTH)
    ");

    $stmt->execute([
        ':tenant_id' => $plan['tenant_id'],
    ]);

    $data = $stmt->fetch();
    $currentMonthly = (int) ($data['total'] ?? 0);

    if ($currentMonthly >= $maxMonthly) {
        json_response([
            'success' => false,
            'message' => 'Monthly conversation limit has been reached for this plan'
        ], 403);
    }
}

function ensure_agent_limit(PDO $pdo, int $tenantId): void
{
    $plan = get_tenant_plan_limits($pdo, $tenantId);

    $maxAgents = (int) $plan['max_agents'];

    if ($maxAgents <= 0) {
        json_response([
            'success' => false,
            'message' => 'Agents are not available in the current plan'
        ], 403);
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM users
        WHERE tenant_id = :tenant_id
          AND role = 'agent'
          AND is_active = 1
    ");

    $stmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $data = $stmt->fetch();
    $currentAgents = (int) ($data['total'] ?? 0);

    if ($currentAgents >= $maxAgents) {
        json_response([
            'success' => false,
            'message' => 'Agent limit has been reached for this plan'
        ], 403);
    }
}

function ensure_site_limit(PDO $pdo, int $tenantId): void
{
    $plan = get_tenant_plan_limits($pdo, $tenantId);

    $maxSites = (int) $plan['max_sites'];

    if ($maxSites <= 0) {
        json_response([
            'success' => false,
            'message' => 'Sites are not available in the current plan'
        ], 403);
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM sites
        WHERE tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $data = $stmt->fetch();
    $currentSites = (int) ($data['total'] ?? 0);

    if ($currentSites >= $maxSites) {
        json_response([
            'success' => false,
            'message' => 'Site limit has been reached for this plan'
        ], 403);
    }
}