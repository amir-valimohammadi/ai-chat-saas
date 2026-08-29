<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/customer-show.php
// هدف: نمای ۳۶۰ درجه مشتری برای Super Admin با آمار، مصرف پلن، سایت‌ها، کاربران، گفتگوها و AI

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$tenantId = filter_var($_GET['tenant_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 1],
]);

if ($tenantId <= 0) {
    json_response([
        'success' => false,
        'message' => 'tenant_id is required',
    ], 422);
}

if (!function_exists('customer_detail_usage_item')) {
    function customer_detail_usage_item(int $used, ?int $limit): array
    {
        $normalizedLimit = $limit !== null ? max(0, $limit) : null;
        $percent = 0.0;

        if ($normalizedLimit !== null && $normalizedLimit > 0) {
            $percent = round(($used * 100) / $normalizedLimit, 1);
        }

        return [
            'used' => $used,
            'limit' => $normalizedLimit,
            'percent' => $percent,
            'is_unlimited' => $normalizedLimit === null || $normalizedLimit === 0,
            'is_near_limit' => $normalizedLimit !== null
                && $normalizedLimit > 0
                && $percent >= 80,
            'is_over_limit' => $normalizedLimit !== null
                && $normalizedLimit > 0
                && $used > $normalizedLimit,
        ];
    }
}

try {
    $tenantStmt = $pdo->prepare("
        SELECT
            tenants.id,
            tenants.name,
            tenants.owner_name,
            tenants.owner_email,
            tenants.owner_phone,
            tenants.status,
            tenants.plan_id,
            tenants.created_at,
            tenants.updated_at,
            plans.name AS plan_name,
            plans.description AS plan_description,
            plans.price_monthly,
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
    $tenantStmt->execute([':tenant_id' => $tenantId]);

    $tenant = $tenantStmt->fetch();

    if (!$tenant) {
        json_response([
            'success' => false,
            'message' => 'Customer not found',
        ], 404);
    }

    $sitesStmt = $pdo->prepare("
        SELECT
            sites.id,
            sites.name,
            sites.domain,
            sites.site_key,
            sites.brand_name,
            sites.brand_color,
            sites.logo_url,
            sites.welcome_message,
            sites.ai_mode,
            sites.is_active,
            sites.created_at,
            sites.updated_at,
            COUNT(conversations.id) AS conversations_count,
            SUM(
                CASE
                    WHEN conversations.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    THEN 1 ELSE 0
                END
            ) AS monthly_conversations,
            MAX(COALESCE(conversations.last_message_at, conversations.created_at)) AS last_activity_at
        FROM sites
        LEFT JOIN conversations ON conversations.site_id = sites.id
        WHERE sites.tenant_id = :tenant_id
        GROUP BY
            sites.id,
            sites.name,
            sites.domain,
            sites.site_key,
            sites.brand_name,
            sites.brand_color,
            sites.logo_url,
            sites.welcome_message,
            sites.ai_mode,
            sites.is_active,
            sites.created_at,
            sites.updated_at
        ORDER BY sites.id DESC
    ");
    $sitesStmt->execute([':tenant_id' => $tenantId]);
    $sitesRaw = $sitesStmt->fetchAll();

    $usersStmt = $pdo->prepare("
        SELECT
            users.id,
            users.name,
            users.email,
            users.phone,
            users.role,
            users.is_active,
            users.last_login_at,
            users.last_seen_at,
            users.availability_status,
            users.created_at,
            users.updated_at
        FROM users
        WHERE users.tenant_id = :tenant_id
          AND users.role IN ('customer_admin', 'agent')
        ORDER BY
            CASE WHEN users.role = 'customer_admin' THEN 0 ELSE 1 END,
            users.id DESC
    ");
    $usersStmt->execute([':tenant_id' => $tenantId]);
    $usersRaw = $usersStmt->fetchAll();

    $conversationMetricsStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS conversations_total,
            SUM(
                CASE
                    WHEN conversations.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    THEN 1 ELSE 0
                END
            ) AS conversations_month,
            SUM(
                CASE
                    WHEN conversations.status IN ('new', 'open', 'in_progress', 'waiting_customer', 'follow_up', 'pending')
                    THEN 1 ELSE 0
                END
            ) AS active_conversations,
            SUM(CASE WHEN conversations.status = 'closed' THEN 1 ELSE 0 END) AS closed_conversations,
            MAX(COALESCE(conversations.last_message_at, conversations.created_at)) AS last_conversation_at
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
    ");
    $conversationMetricsStmt->execute([':tenant_id' => $tenantId]);
    $conversationMetrics = $conversationMetricsStmt->fetch() ?: [];

    $messageMetricsStmt = $pdo->prepare("
        SELECT
            COUNT(messages.id) AS messages_total,
            SUM(
                CASE
                    WHEN messages.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    THEN 1 ELSE 0
                END
            ) AS messages_month,
            MAX(messages.created_at) AS last_message_at
        FROM messages
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
    ");
    $messageMetricsStmt->execute([':tenant_id' => $tenantId]);
    $messageMetrics = $messageMetricsStmt->fetch() ?: [];

    $attachmentMetricsStmt = $pdo->prepare("
        SELECT COUNT(message_attachments.id) AS attachments_total
        FROM message_attachments
        INNER JOIN messages ON messages.id = message_attachments.message_id
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
    ");
    $attachmentMetricsStmt->execute([':tenant_id' => $tenantId]);
    $attachmentsTotal = (int) $attachmentMetricsStmt->fetchColumn();

    $aiStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS requests_total,
            SUM(
                CASE
                    WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    THEN 1 ELSE 0
                END
            ) AS requests_month,
            SUM(
                CASE
                    WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                     AND reply_mode = 'auto_reply'
                    THEN 1 ELSE 0
                END
            ) AS auto_replies_month,
            SUM(
                CASE
                    WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                     AND reply_mode = 'suggestion'
                    THEN 1 ELSE 0
                END
            ) AS suggestions_month,
            SUM(
                CASE
                    WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                     AND reply_mode = 'fallback'
                    THEN 1 ELSE 0
                END
            ) AS fallbacks_month,
            SUM(
                CASE
                    WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                     AND reply_mode = 'no_answer'
                    THEN 1 ELSE 0
                END
            ) AS no_answers_month,
            AVG(
                CASE
                    WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    THEN confidence_score
                    ELSE NULL
                END
            ) AS average_confidence_month,
            MAX(created_at) AS last_ai_activity_at
        FROM ai_answer_logs
        WHERE tenant_id = :tenant_id
          AND request_source <> 'test'
    ");
    $aiStmt->execute([':tenant_id' => $tenantId]);
    $ai = $aiStmt->fetch() ?: [];

    $recentConversationsStmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.status,
            conversations.source_page_title,
            conversations.source_page_url,
            conversations.last_message_at,
            conversations.created_at,
            sites.id AS site_id,
            sites.name AS site_name,
            visitors.name AS visitor_name,
            visitors.email AS visitor_email,
            visitors.phone AS visitor_phone,
            COUNT(messages.id) AS messages_count
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN messages ON messages.conversation_id = conversations.id
        WHERE sites.tenant_id = :tenant_id
        GROUP BY
            conversations.id,
            conversations.status,
            conversations.source_page_title,
            conversations.source_page_url,
            conversations.last_message_at,
            conversations.created_at,
            sites.id,
            sites.name,
            visitors.name,
            visitors.email,
            visitors.phone
        ORDER BY COALESCE(conversations.last_message_at, conversations.created_at) DESC
        LIMIT 8
    ");
    $recentConversationsStmt->execute([':tenant_id' => $tenantId]);
    $recentConversationsRaw = $recentConversationsStmt->fetchAll();

    $plansStmt = $pdo->prepare("
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
            is_active
        FROM plans
        WHERE is_active = 1 OR id = :current_plan_id
        ORDER BY price_monthly ASC, id ASC
    ");
    $plansStmt->execute([
        ':current_plan_id' => $tenant['plan_id'] !== null ? (int) $tenant['plan_id'] : 0,
    ]);
    $plansRaw = $plansStmt->fetchAll();

    $sites = array_map(static function (array $site): array {
        return [
            'id' => (int) $site['id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
            'site_key' => $site['site_key'],
            'brand_name' => $site['brand_name'],
            'brand_color' => $site['brand_color'],
            'logo_url' => $site['logo_url'],
            'welcome_message' => $site['welcome_message'],
            'ai_mode' => $site['ai_mode'],
            'is_active' => (bool) $site['is_active'],
            'conversations_count' => (int) ($site['conversations_count'] ?? 0),
            'monthly_conversations' => (int) ($site['monthly_conversations'] ?? 0),
            'last_activity_at' => $site['last_activity_at'],
            'created_at' => $site['created_at'],
            'updated_at' => $site['updated_at'],
        ];
    }, $sitesRaw);

    $users = array_map(static function (array $targetUser): array {
        $isRecentlyOnline = $targetUser['last_seen_at'] !== null
            && strtotime((string) $targetUser['last_seen_at']) >= (time() - 120);

        return [
            'id' => (int) $targetUser['id'],
            'name' => $targetUser['name'],
            'email' => $targetUser['email'],
            'phone' => $targetUser['phone'],
            'role' => $targetUser['role'],
            'is_active' => (bool) $targetUser['is_active'],
            'last_login_at' => $targetUser['last_login_at'],
            'last_seen_at' => $targetUser['last_seen_at'],
            'availability_status' => $isRecentlyOnline
                ? 'online'
                : 'offline',
            'created_at' => $targetUser['created_at'],
            'updated_at' => $targetUser['updated_at'],
        ];
    }, $usersRaw);

    $recentConversations = array_map(static function (array $conversation): array {
        return [
            'id' => (int) $conversation['id'],
            'site_id' => (int) $conversation['site_id'],
            'site_name' => $conversation['site_name'],
            'visitor_name' => $conversation['visitor_name'],
            'visitor_email' => $conversation['visitor_email'],
            'visitor_phone' => $conversation['visitor_phone'],
            'status' => $conversation['status'],
            'source_page_title' => $conversation['source_page_title'],
            'source_page_url' => $conversation['source_page_url'],
            'messages_count' => (int) ($conversation['messages_count'] ?? 0),
            'last_message_at' => $conversation['last_message_at'],
            'created_at' => $conversation['created_at'],
        ];
    }, $recentConversationsRaw);

    $plans = array_map(static function (array $plan): array {
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
        ];
    }, $plansRaw);

    $sitesCount = count($sites);
    $activeSitesCount = count(array_filter($sites, static fn(array $site): bool => $site['is_active']));
    $usersCount = count($users);
    $activeUsersCount = count(array_filter($users, static fn(array $item): bool => $item['is_active']));
    $agentsCount = count(array_filter($users, static fn(array $item): bool => $item['role'] === 'agent'));
    $activeAgentsCount = count(array_filter(
        $users,
        static fn(array $item): bool => $item['role'] === 'agent' && $item['is_active']
    ));
    $onlineAgentsCount = count(array_filter(
        $users,
        static fn(array $item): bool => $item['role'] === 'agent'
            && $item['is_active']
            && $item['availability_status'] === 'online'
    ));

    $conversationsMonth = (int) ($conversationMetrics['conversations_month'] ?? 0);
    $aiRequestsMonth = (int) ($ai['requests_month'] ?? 0);
    $usableAiMonth = (int) ($ai['auto_replies_month'] ?? 0)
        + (int) ($ai['suggestions_month'] ?? 0);
    $aiUsableRate = $aiRequestsMonth > 0
        ? round(($usableAiMonth * 100) / $aiRequestsMonth, 1)
        : 0.0;

    $activityCandidates = array_filter([
        $tenant['updated_at'],
        $conversationMetrics['last_conversation_at'] ?? null,
        $messageMetrics['last_message_at'] ?? null,
        $ai['last_ai_activity_at'] ?? null,
    ]);
    $lastActivityAt = null;

    foreach ($activityCandidates as $candidate) {
        if ($lastActivityAt === null || strtotime((string) $candidate) > strtotime((string) $lastActivityAt)) {
            $lastActivityAt = $candidate;
        }
    }

    json_response([
        'success' => true,
        'generated_at' => date('Y-m-d H:i:s'),
        'tenant' => [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'owner_name' => $tenant['owner_name'],
            'owner_email' => $tenant['owner_email'],
            'owner_phone' => $tenant['owner_phone'],
            'status' => $tenant['status'],
            'plan_id' => $tenant['plan_id'] !== null ? (int) $tenant['plan_id'] : null,
            'plan_name' => $tenant['plan_name'],
            'plan_description' => $tenant['plan_description'],
            'plan_is_active' => $tenant['plan_is_active'] !== null
                ? (bool) $tenant['plan_is_active']
                : null,
            'price_monthly' => $tenant['price_monthly'] !== null
                ? (float) $tenant['price_monthly']
                : null,
            'created_at' => $tenant['created_at'],
            'updated_at' => $tenant['updated_at'],
            'last_activity_at' => $lastActivityAt,
        ],
        'summary' => [
            'sites_count' => $sitesCount,
            'active_sites_count' => $activeSitesCount,
            'users_count' => $usersCount,
            'active_users_count' => $activeUsersCount,
            'agents_count' => $agentsCount,
            'active_agents_count' => $activeAgentsCount,
            'online_agents_count' => $onlineAgentsCount,
            'conversations_count' => (int) ($conversationMetrics['conversations_total'] ?? 0),
            'monthly_conversations' => $conversationsMonth,
            'messages_count' => (int) ($messageMetrics['messages_total'] ?? 0),
            'monthly_messages' => (int) ($messageMetrics['messages_month'] ?? 0),
            'attachments_count' => $attachmentsTotal,
            'active_conversations' => (int) ($conversationMetrics['active_conversations'] ?? 0),
            'closed_conversations' => (int) ($conversationMetrics['closed_conversations'] ?? 0),
        ],
        'usage' => [
            'sites' => customer_detail_usage_item(
                $sitesCount,
                $tenant['max_sites'] !== null ? (int) $tenant['max_sites'] : null
            ),
            'agents' => customer_detail_usage_item(
                $agentsCount,
                $tenant['max_agents'] !== null ? (int) $tenant['max_agents'] : null
            ),
            'monthly_conversations' => customer_detail_usage_item(
                $conversationsMonth,
                $tenant['max_monthly_conversations'] !== null
                    ? (int) $tenant['max_monthly_conversations']
                    : null
            ),
        ],
        'plan_features' => [
            'ai_suggestions_enabled' => (bool) ($tenant['ai_suggestions_enabled'] ?? false),
            'ai_auto_reply_enabled' => (bool) ($tenant['ai_auto_reply_enabled'] ?? false),
            'knowledge_base_enabled' => (bool) ($tenant['knowledge_base_enabled'] ?? false),
        ],
        'ai_summary' => [
            'requests_total' => (int) ($ai['requests_total'] ?? 0),
            'requests_month' => $aiRequestsMonth,
            'auto_replies_month' => (int) ($ai['auto_replies_month'] ?? 0),
            'suggestions_month' => (int) ($ai['suggestions_month'] ?? 0),
            'fallbacks_month' => (int) ($ai['fallbacks_month'] ?? 0),
            'no_answers_month' => (int) ($ai['no_answers_month'] ?? 0),
            'average_confidence_month' => round((float) ($ai['average_confidence_month'] ?? 0), 1),
            'usable_rate_month' => $aiUsableRate,
            'last_activity_at' => $ai['last_ai_activity_at'] ?? null,
        ],
        'sites' => $sites,
        'users' => $users,
        'recent_conversations' => $recentConversations,
        'plans' => $plans,
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] customer-show failed: ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'Failed to load customer details',
        ...safe_api_exception_context($e),
    ], 500);
}
