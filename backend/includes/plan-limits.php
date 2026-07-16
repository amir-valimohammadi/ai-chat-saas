<?php

// مسیر فایل: ai-chat-saas/backend/includes/plan-limits.php
// هدف: دریافت، گزارش و اعمال یکپارچه محدودیت‌های پلن مشتری

require_once __DIR__ . '/response.php';

const PLAN_FEATURE_KEYS = [
    'ai_suggestions_enabled',
    'ai_auto_reply_enabled',
    'knowledge_base_enabled',
];

function plan_limit_error(
    string $code,
    string $message,
    int $status = 403,
    array $details = []
): void {
    json_response(array_merge([
        'success' => false,
        'code' => $code,
        'message' => $message,
    ], $details), $status);
}

function get_tenant_plan_limits(
    PDO $pdo,
    int $tenantId,
    bool $requireActive = true
): array {
    $stmt = $pdo->prepare("
        SELECT
            tenants.id AS tenant_id,
            tenants.name AS tenant_name,
            tenants.status AS tenant_status,
            tenants.plan_id,
            plans.name AS plan_name,
            plans.description AS plan_description,
            plans.max_sites,
            plans.max_agents,
            plans.max_monthly_conversations,
            plans.ai_suggestions_enabled,
            plans.ai_auto_reply_enabled,
            plans.knowledge_base_enabled,
            plans.price_monthly,
            plans.is_active AS plan_is_active
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        WHERE tenants.id = :tenant_id
        LIMIT 1
    ");

    $stmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $row = $stmt->fetch();

    if (!$row) {
        plan_limit_error('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }

    $plan = [
        'tenant_id' => (int) $row['tenant_id'],
        'tenant_name' => $row['tenant_name'],
        'tenant_status' => $row['tenant_status'],
        'plan_id' => $row['plan_id'] !== null ? (int) $row['plan_id'] : null,
        'plan_name' => $row['plan_name'],
        'plan_description' => $row['plan_description'],
        'plan_is_active' => (bool) ($row['plan_is_active'] ?? false),
        'max_sites' => (int) ($row['max_sites'] ?? 0),
        'max_agents' => (int) ($row['max_agents'] ?? 0),
        'max_monthly_conversations' => (int) ($row['max_monthly_conversations'] ?? 0),
        'ai_suggestions_enabled' => (bool) ($row['ai_suggestions_enabled'] ?? false),
        'ai_auto_reply_enabled' => (bool) ($row['ai_auto_reply_enabled'] ?? false),
        'knowledge_base_enabled' => (bool) ($row['knowledge_base_enabled'] ?? false),
        'price_monthly' => (float) ($row['price_monthly'] ?? 0),
    ];

    if (!$requireActive) {
        return $plan;
    }

    if ($plan['tenant_status'] !== 'active') {
        plan_limit_error(
            'CUSTOMER_INACTIVE',
            'Customer account is not active',
            403,
            ['customer_status' => $plan['tenant_status']]
        );
    }

    if ($plan['plan_id'] === null) {
        plan_limit_error(
            'PLAN_NOT_ASSIGNED',
            'Customer does not have an assigned plan',
            403
        );
    }

    if (!$plan['plan_is_active']) {
        plan_limit_error(
            'PLAN_INACTIVE',
            'Customer plan is not active',
            403,
            [
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ]
        );
    }

    return $plan;
}

function get_site_plan_limits(
    PDO $pdo,
    int $siteId,
    bool $requireActive = true
): array {
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
        plan_limit_error('SITE_NOT_FOUND', 'Site not found', 404);
    }

    return get_tenant_plan_limits(
        $pdo,
        (int) $site['tenant_id'],
        $requireActive
    );
}

function plan_has_feature(array $plan, string $featureKey): bool
{
    if (!in_array($featureKey, PLAN_FEATURE_KEYS, true)) {
        throw new InvalidArgumentException('Unknown plan feature key');
    }

    return !empty($plan[$featureKey]);
}

function tenant_plan_has_feature(
    PDO $pdo,
    int $tenantId,
    string $featureKey,
    bool $requireActive = true
): bool {
    return plan_has_feature(
        get_tenant_plan_limits($pdo, $tenantId, $requireActive),
        $featureKey
    );
}

function site_plan_has_feature(
    PDO $pdo,
    int $siteId,
    string $featureKey,
    bool $requireActive = true
): bool {
    return plan_has_feature(
        get_site_plan_limits($pdo, $siteId, $requireActive),
        $featureKey
    );
}

function require_plan_feature(
    PDO $pdo,
    int $tenantId,
    string $featureKey,
    string $featureLabel
): void {
    $plan = get_tenant_plan_limits($pdo, $tenantId);

    if (!plan_has_feature($plan, $featureKey)) {
        plan_limit_error(
            'PLAN_FEATURE_UNAVAILABLE',
            "{$featureLabel} is not available in the current plan",
            403,
            [
                'feature' => $featureKey,
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ]
        );
    }
}

function require_site_plan_feature(
    PDO $pdo,
    int $siteId,
    string $featureKey,
    string $featureLabel
): void {
    $plan = get_site_plan_limits($pdo, $siteId);

    if (!plan_has_feature($plan, $featureKey)) {
        plan_limit_error(
            'PLAN_FEATURE_UNAVAILABLE',
            "{$featureLabel} is not available in the current plan",
            403,
            [
                'feature' => $featureKey,
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ]
        );
    }
}

function lock_tenant_plan_scope(PDO $pdo, int $tenantId): void
{
    if (!$pdo->inTransaction()) {
        throw new RuntimeException(
            'Tenant plan lock requires an active database transaction'
        );
    }

    $stmt = $pdo->prepare("
        SELECT id
        FROM tenants
        WHERE id = :tenant_id
        FOR UPDATE
    ");

    $stmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    if (!$stmt->fetch()) {
        plan_limit_error('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }
}

function build_plan_usage_item(int $used, int $limit): array
{
    $percent = $limit > 0 ? round(($used / $limit) * 100, 1) : 0.0;
    $remaining = max($limit - $used, 0);
    $overBy = max($used - $limit, 0);

    if ($limit <= 0) {
        $status = 'unavailable';
    } elseif ($used > $limit) {
        $status = 'exceeded';
    } elseif ($used === $limit) {
        $status = 'reached';
    } elseif ($percent >= 80) {
        $status = 'warning';
    } else {
        $status = 'normal';
    }

    return [
        'used' => $used,
        'limit' => $limit,
        'remaining' => $remaining,
        'percent' => $percent,
        'near_limit' => $limit > 0 && $percent >= 80,
        'reached' => $limit > 0 && $used >= $limit,
        'over_limit' => $limit > 0 && $used > $limit,
        'over_by' => $overBy,
        'status' => $status,
    ];
}

function get_tenant_plan_usage(PDO $pdo, int $tenantId): array
{
    $sitesStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM sites
        WHERE tenant_id = :tenant_id
    ");
    $sitesStmt->execute([':tenant_id' => $tenantId]);
    $sites = (int) $sitesStmt->fetchColumn();

    $agentsStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_agents,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_agents
        FROM users
        WHERE tenant_id = :tenant_id
          AND role = 'agent'
    ");
    $agentsStmt->execute([':tenant_id' => $tenantId]);
    $agentData = $agentsStmt->fetch() ?: [];

    $conversationsStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
          AND conversations.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
          AND conversations.created_at < DATE_ADD(
              DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'),
              INTERVAL 1 MONTH
          )
    ");
    $conversationsStmt->execute([':tenant_id' => $tenantId]);
    $monthlyConversations = (int) $conversationsStmt->fetchColumn();

    $knowledgeStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM knowledge_sources
        INNER JOIN sites ON sites.id = knowledge_sources.site_id
        WHERE sites.tenant_id = :tenant_id
          AND knowledge_sources.status <> 'archived'
    ");
    $knowledgeStmt->execute([':tenant_id' => $tenantId]);
    $knowledgeItems = (int) $knowledgeStmt->fetchColumn();

    $suggestionsStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM ai_suggestions
        INNER JOIN conversations
            ON conversations.id = ai_suggestions.conversation_id
        INNER JOIN sites
            ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
          AND ai_suggestions.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
          AND ai_suggestions.created_at < DATE_ADD(
              DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'),
              INTERVAL 1 MONTH
          )
    ");
    $suggestionsStmt->execute([':tenant_id' => $tenantId]);
    $monthlySuggestions = (int) $suggestionsStmt->fetchColumn();

    $autoReplyStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM ai_answer_logs
        WHERE tenant_id = :tenant_id
          AND request_source <> 'test'
          AND reply_mode = 'auto_reply'
          AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
          AND created_at < DATE_ADD(
              DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'),
              INTERVAL 1 MONTH
          )
    ");
    $autoReplyStmt->execute([':tenant_id' => $tenantId]);
    $monthlyAutoReplies = (int) $autoReplyStmt->fetchColumn();

    return [
        'sites' => $sites,
        'agents' => (int) ($agentData['total_agents'] ?? 0),
        'active_agents' => (int) ($agentData['active_agents'] ?? 0),
        'monthly_conversations' => $monthlyConversations,
        'knowledge_items' => $knowledgeItems,
        'monthly_ai_suggestions' => $monthlySuggestions,
        'monthly_ai_auto_replies' => $monthlyAutoReplies,
    ];
}

function ensure_agent_limit(
    PDO $pdo,
    int $tenantId,
    bool $lockTenant = false
): array {
    if ($lockTenant) {
        lock_tenant_plan_scope($pdo, $tenantId);
    }

    $plan = get_tenant_plan_limits($pdo, $tenantId);
    $usage = get_tenant_plan_usage($pdo, $tenantId);
    $used = (int) $usage['agents'];
    $limit = (int) $plan['max_agents'];

    if ($limit <= 0 || $used >= $limit) {
        plan_limit_error(
            'PLAN_AGENT_LIMIT_REACHED',
            'Agent limit has been reached for this plan',
            403,
            [
                'resource' => 'agents',
                'used' => $used,
                'limit' => $limit,
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ]
        );
    }

    return build_plan_usage_item($used, $limit);
}

function ensure_site_limit(
    PDO $pdo,
    int $tenantId,
    bool $lockTenant = false
): array {
    if ($lockTenant) {
        lock_tenant_plan_scope($pdo, $tenantId);
    }

    $plan = get_tenant_plan_limits($pdo, $tenantId);
    $usage = get_tenant_plan_usage($pdo, $tenantId);
    $used = (int) $usage['sites'];
    $limit = (int) $plan['max_sites'];

    if ($limit <= 0 || $used >= $limit) {
        plan_limit_error(
            'PLAN_SITE_LIMIT_REACHED',
            'Site limit has been reached for this plan',
            403,
            [
                'resource' => 'sites',
                'used' => $used,
                'limit' => $limit,
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ]
        );
    }

    return build_plan_usage_item($used, $limit);
}

function ensure_monthly_conversation_limit(
    PDO $pdo,
    int $siteId,
    bool $lockTenant = false
): array {
    $siteStmt = $pdo->prepare("
        SELECT tenant_id
        FROM sites
        WHERE id = :site_id
        LIMIT 1
    ");
    $siteStmt->execute([':site_id' => $siteId]);
    $site = $siteStmt->fetch();

    if (!$site) {
        plan_limit_error('SITE_NOT_FOUND', 'Site not found', 404);
    }

    $tenantId = (int) $site['tenant_id'];

    if ($lockTenant) {
        lock_tenant_plan_scope($pdo, $tenantId);
    }

    $plan = get_tenant_plan_limits($pdo, $tenantId);
    $usage = get_tenant_plan_usage($pdo, $tenantId);
    $used = (int) $usage['monthly_conversations'];
    $limit = (int) $plan['max_monthly_conversations'];

    if ($limit <= 0 || $used >= $limit) {
        plan_limit_error(
            'PLAN_CONVERSATION_LIMIT_REACHED',
            'Monthly conversation limit has been reached for this plan',
            403,
            [
                'resource' => 'monthly_conversations',
                'used' => $used,
                'limit' => $limit,
                'period' => date('Y-m'),
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ]
        );
    }

    return build_plan_usage_item($used, $limit);
}
