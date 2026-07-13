<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/tenants-list.php
// هدف: فهرست حرفه‌ای مشتری‌ها با جست‌وجو، فیلتر، مرتب‌سازی، صفحه‌بندی و آمار مصرف

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

$search = trim(is_string($_GET['search'] ?? null) ? $_GET['search'] : '');
$status = trim(is_string($_GET['status'] ?? null) ? $_GET['status'] : 'all');
$sort = trim(is_string($_GET['sort'] ?? null) ? $_GET['sort'] : 'newest');
$planId = filter_var($_GET['plan_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 0],
]);
$page = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT, [
    'options' => ['default' => 1, 'min_range' => 1],
]);
$perPage = filter_var($_GET['per_page'] ?? 12, FILTER_VALIDATE_INT, [
    'options' => ['default' => 12, 'min_range' => 1],
]);

if (function_exists('mb_substr')) {
    $search = mb_substr($search, 0, 120);
} else {
    $search = substr($search, 0, 120);
}

$allowedStatuses = ['all', 'active', 'inactive', 'suspended'];
$allowedPerPage = [8, 12, 24, 48];
$sortMap = [
    'newest' => 'tenants.id DESC',
    'oldest' => 'tenants.id ASC',
    'name_asc' => 'tenants.name ASC, tenants.id DESC',
    'name_desc' => 'tenants.name DESC, tenants.id DESC',
    'usage_desc' => 'usage_percent DESC, tenants.id DESC',
    'activity_desc' => 'last_activity_at DESC, tenants.id DESC',
];

if (!in_array($status, $allowedStatuses, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid status filter',
    ], 422);
}

if (!isset($sortMap[$sort])) {
    json_response([
        'success' => false,
        'message' => 'Invalid sort option',
    ], 422);
}

if (!in_array($perPage, $allowedPerPage, true)) {
    $perPage = 12;
}

$where = ['1 = 1'];
$params = [];

if ($search !== '') {
    $likeSearch = '%' . $search . '%';

    $where[] = "(
        tenants.name LIKE :search_name
        OR tenants.owner_name LIKE :search_owner
        OR tenants.owner_email LIKE :search_email
        OR tenants.owner_phone LIKE :search_phone
        OR plans.name LIKE :search_plan
        OR CAST(tenants.id AS CHAR) LIKE :search_id
    )";

    $params[':search_name'] = $likeSearch;
    $params[':search_owner'] = $likeSearch;
    $params[':search_email'] = $likeSearch;
    $params[':search_phone'] = $likeSearch;
    $params[':search_plan'] = $likeSearch;
    $params[':search_id'] = $likeSearch;
}

if ($status !== 'all') {
    $where[] = 'tenants.status = :status';
    $params[':status'] = $status;
}

if ($planId > 0) {
    $where[] = 'tenants.plan_id = :plan_id';
    $params[':plan_id'] = $planId;
}

$whereSql = implode(' AND ', $where);
$orderBySql = $sortMap[$sort];

try {
    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        WHERE {$whereSql}
    ");
    $countStmt->execute($params);

    $filteredTotal = (int) $countStmt->fetchColumn();
    $totalPages = max(1, (int) ceil($filteredTotal / $perPage));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * $perPage;

    $listSql = "
        SELECT
            tenants.id,
            tenants.name,
            tenants.owner_name,
            tenants.owner_email,
            tenants.owner_phone,
            tenants.plan_id,
            tenants.status,
            tenants.created_at,
            tenants.updated_at,
            plans.name AS plan_name,
            plans.max_monthly_conversations,
            plans.is_active AS plan_is_active,
            COALESCE(site_stats.sites_count, 0) AS sites_count,
            COALESCE(site_stats.active_sites_count, 0) AS active_sites_count,
            COALESCE(user_stats.users_count, 0) AS users_count,
            COALESCE(user_stats.agents_count, 0) AS agents_count,
            COALESCE(conversation_stats.total_conversations, 0) AS total_conversations,
            COALESCE(conversation_stats.monthly_conversations, 0) AS monthly_conversations,
            COALESCE(message_stats.monthly_messages, 0) AS monthly_messages,
            CASE
                WHEN COALESCE(plans.max_monthly_conversations, 0) > 0 THEN
                    ROUND(
                        (COALESCE(conversation_stats.monthly_conversations, 0) * 100.0)
                        / plans.max_monthly_conversations,
                        1
                    )
                ELSE 0
            END AS usage_percent,
            GREATEST(
                COALESCE(tenants.updated_at, tenants.created_at),
                COALESCE(conversation_stats.last_conversation_at, '1970-01-01 00:00:00'),
                COALESCE(user_stats.last_user_activity_at, '1970-01-01 00:00:00')
            ) AS last_activity_at
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        LEFT JOIN (
            SELECT
                tenant_id,
                COUNT(*) AS sites_count,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_sites_count
            FROM sites
            GROUP BY tenant_id
        ) AS site_stats ON site_stats.tenant_id = tenants.id
        LEFT JOIN (
            SELECT
                tenant_id,
                COUNT(*) AS users_count,
                SUM(CASE WHEN role = 'agent' THEN 1 ELSE 0 END) AS agents_count,
                MAX(COALESCE(last_seen_at, last_login_at, created_at)) AS last_user_activity_at
            FROM users
            WHERE tenant_id IS NOT NULL
            GROUP BY tenant_id
        ) AS user_stats ON user_stats.tenant_id = tenants.id
        LEFT JOIN (
            SELECT
                sites.tenant_id,
                COUNT(conversations.id) AS total_conversations,
                SUM(
                    CASE
                        WHEN conversations.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                        THEN 1
                        ELSE 0
                    END
                ) AS monthly_conversations,
                MAX(COALESCE(conversations.last_message_at, conversations.created_at)) AS last_conversation_at
            FROM sites
            LEFT JOIN conversations ON conversations.site_id = sites.id
            GROUP BY sites.tenant_id
        ) AS conversation_stats ON conversation_stats.tenant_id = tenants.id
        LEFT JOIN (
            SELECT
                sites.tenant_id,
                COUNT(messages.id) AS monthly_messages
            FROM sites
            INNER JOIN conversations ON conversations.site_id = sites.id
            INNER JOIN messages
                ON messages.conversation_id = conversations.id
               AND messages.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            GROUP BY sites.tenant_id
        ) AS message_stats ON message_stats.tenant_id = tenants.id
        WHERE {$whereSql}
        ORDER BY {$orderBySql}
        LIMIT :limit OFFSET :offset
    ";

    $listStmt = $pdo->prepare($listSql);

    foreach ($params as $key => $value) {
        $listStmt->bindValue($key, $value, PDO::PARAM_STR);
    }

    $listStmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $listStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $listStmt->execute();

    $tenants = array_map(static function (array $tenant): array {
        return [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'owner_name' => $tenant['owner_name'],
            'owner_email' => $tenant['owner_email'],
            'owner_phone' => $tenant['owner_phone'],
            'status' => $tenant['status'],
            'plan_id' => $tenant['plan_id'] !== null ? (int) $tenant['plan_id'] : null,
            'plan_name' => $tenant['plan_name'],
            'plan_is_active' => $tenant['plan_is_active'] !== null
                ? (bool) $tenant['plan_is_active']
                : null,
            'max_monthly_conversations' => $tenant['max_monthly_conversations'] !== null
                ? (int) $tenant['max_monthly_conversations']
                : null,
            'sites_count' => (int) $tenant['sites_count'],
            'active_sites_count' => (int) $tenant['active_sites_count'],
            'users_count' => (int) $tenant['users_count'],
            'agents_count' => (int) $tenant['agents_count'],
            'total_conversations' => (int) $tenant['total_conversations'],
            'monthly_conversations' => (int) $tenant['monthly_conversations'],
            'monthly_messages' => (int) $tenant['monthly_messages'],
            'usage_percent' => (float) $tenant['usage_percent'],
            'last_activity_at' => $tenant['last_activity_at'],
            'created_at' => $tenant['created_at'],
            'updated_at' => $tenant['updated_at'],
        ];
    }, $listStmt->fetchAll());

    $summaryStmt = $pdo->query("
        SELECT
            (SELECT COUNT(*) FROM tenants) AS total,
            (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active,
            (SELECT COUNT(*) FROM tenants WHERE status = 'inactive') AS inactive,
            (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') AS suspended,
            (SELECT COUNT(*) FROM sites) AS sites,
            (SELECT COUNT(*) FROM users WHERE tenant_id IS NOT NULL) AS users,
            (SELECT COUNT(*) FROM users WHERE tenant_id IS NOT NULL AND role = 'agent') AS agents
    ");
    $summary = $summaryStmt->fetch() ?: [];

    $plansStmt = $pdo->query("
        SELECT
            id,
            name,
            max_monthly_conversations,
            is_active
        FROM plans
        ORDER BY is_active DESC, id ASC
    ");

    $plans = array_map(static function (array $plan): array {
        return [
            'id' => (int) $plan['id'],
            'name' => $plan['name'],
            'max_monthly_conversations' => (int) $plan['max_monthly_conversations'],
            'is_active' => (bool) $plan['is_active'],
        ];
    }, $plansStmt->fetchAll());

    json_response([
        'success' => true,
        'generated_at' => date('Y-m-d H:i:s'),
        'tenants' => $tenants,
        'summary' => [
            'total' => (int) ($summary['total'] ?? 0),
            'active' => (int) ($summary['active'] ?? 0),
            'inactive' => (int) ($summary['inactive'] ?? 0),
            'suspended' => (int) ($summary['suspended'] ?? 0),
            'sites' => (int) ($summary['sites'] ?? 0),
            'users' => (int) ($summary['users'] ?? 0),
            'agents' => (int) ($summary['agents'] ?? 0),
        ],
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $filteredTotal,
            'total_pages' => $totalPages,
            'from' => $filteredTotal > 0 ? $offset + 1 : 0,
            'to' => $filteredTotal > 0 ? min($offset + $perPage, $filteredTotal) : 0,
        ],
        'filters' => [
            'plans' => $plans,
            'statuses' => ['active', 'inactive', 'suspended'],
            'sort_options' => array_keys($sortMap),
        ],
        'applied_filters' => [
            'search' => $search,
            'status' => $status,
            'plan_id' => $planId > 0 ? $planId : null,
            'sort' => $sort,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] tenants-list failed: ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'Failed to load tenants',
        'error' => $e->getMessage(),
    ], 500);
}
