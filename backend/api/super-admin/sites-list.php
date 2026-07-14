<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/sites-list.php
// هدف: فهرست حرفه‌ای و صفحه‌بندی‌شده سایت‌ها برای Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/app.php';
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

$search = is_string($_GET['search'] ?? null) ? trim($_GET['search']) : '';
$tenantId = filter_var($_GET['tenant_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 0],
]);
$status = is_string($_GET['status'] ?? null) ? trim($_GET['status']) : 'all';
$aiMode = is_string($_GET['ai_mode'] ?? null) ? trim($_GET['ai_mode']) : 'all';
$health = is_string($_GET['health'] ?? null) ? trim($_GET['health']) : 'all';
$sort = is_string($_GET['sort'] ?? null) ? trim($_GET['sort']) : 'newest';
$page = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT, [
    'options' => ['default' => 1, 'min_range' => 1],
]);
$perPage = filter_var($_GET['per_page'] ?? 12, FILTER_VALIDATE_INT, [
    'options' => ['default' => 12, 'min_range' => 1, 'max_range' => 48],
]);

$allowedStatuses = ['all', 'active', 'inactive'];
$allowedAiModes = ['all', 'off', 'assistant', 'semi_auto'];
$allowedHealth = ['all', 'healthy', 'attention', 'inactive'];
$allowedSorts = [
    'newest' => 's.id DESC',
    'oldest' => 's.id ASC',
    'name_asc' => 's.name ASC, s.id DESC',
    'conversations_desc' => 'conversations_count DESC, s.id DESC',
    'activity_desc' => 'last_activity_at DESC, s.id DESC',
    'knowledge_desc' => 'knowledge_items_count DESC, s.id DESC',
];

if (!in_array($status, $allowedStatuses, true)) {
    $status = 'all';
}

if (!in_array($aiMode, $allowedAiModes, true)) {
    $aiMode = 'all';
}

if (!in_array($health, $allowedHealth, true)) {
    $health = 'all';
}

if (!array_key_exists($sort, $allowedSorts)) {
    $sort = 'newest';
}

$conversationCountExpr = "(
    SELECT COUNT(*)
    FROM conversations c
    WHERE c.site_id = s.id
)";

$monthlyConversationCountExpr = "(
    SELECT COUNT(*)
    FROM conversations c_month
    WHERE c_month.site_id = s.id
      AND c_month.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
)";

$lastConversationAtExpr = "(
    SELECT MAX(COALESCE(c_last.last_message_at, c_last.updated_at, c_last.created_at))
    FROM conversations c_last
    WHERE c_last.site_id = s.id
)";

$widgetEventsCountExpr = "(
    SELECT COUNT(*)
    FROM widget_events we
    WHERE we.site_id = s.id
)";

$lastWidgetEventAtExpr = "(
    SELECT MAX(we_last.created_at)
    FROM widget_events we_last
    WHERE we_last.site_id = s.id
)";

$manualKnowledgeCountExpr = "(
    SELECT COUNT(*)
    FROM knowledge_sources ks
    WHERE ks.site_id = s.id
      AND ks.status = 'approved'
)";

$crawledPagesCountExpr = "(
    SELECT COUNT(*)
    FROM ai_pages ap
    WHERE ap.site_id = s.id
      AND ap.crawl_status = 'success'
)";

$knowledgeItemsCountExpr = "($manualKnowledgeCountExpr + $crawledPagesCountExpr)";

$activeCrawlSourcesCountExpr = "(
    SELECT COUNT(*)
    FROM ai_crawl_sources acs
    WHERE acs.site_id = s.id
      AND acs.is_active = 1
)";

$aiRequestsMonthExpr = "(
    SELECT COUNT(*)
    FROM ai_answer_logs aal
    WHERE aal.site_id = s.id
      AND aal.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
)";

$aiUsableMonthExpr = "(
    SELECT COUNT(*)
    FROM ai_answer_logs aal_ok
    WHERE aal_ok.site_id = s.id
      AND aal_ok.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
      AND aal_ok.reply_mode IN ('suggestion', 'auto_reply')
)";

$lastActivityAtExpr = "GREATEST(
    COALESCE($lastConversationAtExpr, '1970-01-01 00:00:00'),
    COALESCE($lastWidgetEventAtExpr, '1970-01-01 00:00:00'),
    COALESCE(s.updated_at, s.created_at)
)";

$healthyCondition = "(
    s.is_active = 1
    AND t.status = 'active'
    AND ($conversationCountExpr > 0 OR $widgetEventsCountExpr > 0)
    AND (s.ai_mode = 'off' OR $knowledgeItemsCountExpr > 0)
)";

$inactiveCondition = "(s.is_active = 0 OR t.status <> 'active')";

$where = ['1 = 1'];
$params = [];

if ($search !== '') {
    $where[] = "(
        s.name LIKE :search
        OR s.domain LIKE :search
        OR s.site_key LIKE :search
        OR COALESCE(s.brand_name, '') LIKE :search
        OR t.name LIKE :search
    )";
    $params[':search'] = '%' . $search . '%';
}

if ($tenantId > 0) {
    $where[] = 's.tenant_id = :tenant_id';
    $params[':tenant_id'] = $tenantId;
}

if ($status === 'active') {
    $where[] = 's.is_active = 1';
} elseif ($status === 'inactive') {
    $where[] = 's.is_active = 0';
}

if ($aiMode !== 'all') {
    $where[] = 's.ai_mode = :ai_mode';
    $params[':ai_mode'] = $aiMode;
}

if ($health === 'healthy') {
    $where[] = $healthyCondition;
} elseif ($health === 'inactive') {
    $where[] = $inactiveCondition;
} elseif ($health === 'attention') {
    $where[] = "(NOT $healthyCondition AND NOT $inactiveCondition)";
}

$whereSql = implode(' AND ', $where);
$offset = ($page - 1) * $perPage;
$orderBy = $allowedSorts[$sort];

try {
    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM sites s
        INNER JOIN tenants t ON t.id = s.tenant_id
        WHERE $whereSql
    ");
    $countStmt->execute($params);
    $filteredTotal = (int) $countStmt->fetchColumn();

    $sitesStmt = $pdo->prepare("
        SELECT
            s.id,
            s.tenant_id,
            t.name AS tenant_name,
            t.status AS tenant_status,
            s.name,
            s.domain,
            s.site_key,
            s.brand_name,
            s.brand_color,
            s.logo_url,
            s.welcome_message,
            s.ai_mode,
            s.is_active,
            s.created_at,
            s.updated_at,
            $conversationCountExpr AS conversations_count,
            $monthlyConversationCountExpr AS monthly_conversations_count,
            $widgetEventsCountExpr AS widget_events_count,
            $manualKnowledgeCountExpr AS manual_knowledge_count,
            $crawledPagesCountExpr AS crawled_pages_count,
            $knowledgeItemsCountExpr AS knowledge_items_count,
            $activeCrawlSourcesCountExpr AS active_crawl_sources_count,
            $aiRequestsMonthExpr AS ai_requests_month,
            $aiUsableMonthExpr AS ai_usable_month,
            $lastConversationAtExpr AS last_conversation_at,
            $lastWidgetEventAtExpr AS last_widget_event_at,
            $lastActivityAtExpr AS last_activity_at,
            (
                SELECT acr.status
                FROM ai_crawl_runs acr
                WHERE acr.site_id = s.id
                ORDER BY acr.id DESC
                LIMIT 1
            ) AS last_crawl_status,
            (
                SELECT COALESCE(acr2.finished_at, acr2.started_at, acr2.created_at)
                FROM ai_crawl_runs acr2
                WHERE acr2.site_id = s.id
                ORDER BY acr2.id DESC
                LIMIT 1
            ) AS last_crawl_at
        FROM sites s
        INNER JOIN tenants t ON t.id = s.tenant_id
        WHERE $whereSql
        ORDER BY $orderBy
        LIMIT :limit OFFSET :offset
    ");

    foreach ($params as $key => $value) {
        $sitesStmt->bindValue($key, $value);
    }
    $sitesStmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $sitesStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $sitesStmt->execute();
    $sites = $sitesStmt->fetchAll();

    $summaryStmt = $pdo->query("
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN s.is_active = 1 AND t.status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN s.is_active = 0 OR t.status <> 'active' THEN 1 ELSE 0 END) AS inactive,
            SUM(CASE WHEN s.ai_mode <> 'off' THEN 1 ELSE 0 END) AS ai_enabled,
            SUM($conversationCountExpr) AS conversations,
            SUM($monthlyConversationCountExpr) AS monthly_conversations,
            SUM(CASE WHEN $healthyCondition THEN 1 ELSE 0 END) AS healthy,
            SUM(CASE WHEN NOT $healthyCondition AND NOT $inactiveCondition THEN 1 ELSE 0 END) AS attention
        FROM sites s
        INNER JOIN tenants t ON t.id = s.tenant_id
    ");
    $summary = $summaryStmt->fetch() ?: [];

    $tenantsStmt = $pdo->query("
        SELECT
            t.id,
            t.name,
            t.status,
            COUNT(s.id) AS sites_count
        FROM tenants t
        LEFT JOIN sites s ON s.tenant_id = t.id
        GROUP BY t.id, t.name, t.status
        ORDER BY t.name ASC
    ");
    $tenantOptions = $tenantsStmt->fetchAll();

    $widgetScriptUrl = rtrim((string) app_config(
        'widget_script_url',
        'http://localhost/ai-chat-saas/widget/dist/widget.js'
    ));
    $apiBaseUrl = rtrim((string) app_config(
        'api_url',
        'http://localhost/ai-chat-saas/backend/api'
    ), '/');

    $mappedSites = array_map(static function (array $site) use ($widgetScriptUrl, $apiBaseUrl): array {
        $isActive = (bool) $site['is_active'];
        $tenantActive = $site['tenant_status'] === 'active';
        $conversationCount = (int) $site['conversations_count'];
        $widgetEventsCount = (int) $site['widget_events_count'];
        $knowledgeCount = (int) $site['knowledge_items_count'];
        $aiModeValue = (string) $site['ai_mode'];

        if (!$isActive || !$tenantActive) {
            $healthStatus = 'inactive';
            $healthText = !$tenantActive ? 'حساب مشتری فعال نیست' : 'سایت غیرفعال است';
        } elseif (($conversationCount + $widgetEventsCount) === 0) {
            $healthStatus = 'attention';
            $healthText = 'هنوز فعالیتی از ویجت ثبت نشده';
        } elseif ($aiModeValue !== 'off' && $knowledgeCount === 0) {
            $healthStatus = 'attention';
            $healthText = 'AI فعال است اما منبع دانش ندارد';
        } else {
            $healthStatus = 'healthy';
            $healthText = 'سایت و ویجت در وضعیت مناسب هستند';
        }

        $aiRequests = (int) $site['ai_requests_month'];
        $aiUsable = (int) $site['ai_usable_month'];
        $aiSuccessRate = $aiRequests > 0
            ? round(($aiUsable / $aiRequests) * 100, 1)
            : null;

        $siteKey = (string) $site['site_key'];
        $installCode = '<script src="'
            . htmlspecialchars($widgetScriptUrl, ENT_QUOTES, 'UTF-8')
            . '" data-site-key="'
            . htmlspecialchars($siteKey, ENT_QUOTES, 'UTF-8')
            . '" data-api-base="'
            . htmlspecialchars($apiBaseUrl, ENT_QUOTES, 'UTF-8')
            . '" defer></script>';

        return [
            'id' => (int) $site['id'],
            'tenant_id' => (int) $site['tenant_id'],
            'tenant_name' => $site['tenant_name'],
            'tenant_status' => $site['tenant_status'],
            'name' => $site['name'],
            'domain' => $site['domain'],
            'site_key' => $siteKey,
            'brand_name' => $site['brand_name'],
            'brand_color' => $site['brand_color'],
            'logo_url' => $site['logo_url'],
            'welcome_message' => $site['welcome_message'],
            'ai_mode' => $aiModeValue,
            'is_active' => $isActive,
            'created_at' => $site['created_at'],
            'updated_at' => $site['updated_at'],
            'conversations_count' => $conversationCount,
            'monthly_conversations_count' => (int) $site['monthly_conversations_count'],
            'widget_events_count' => $widgetEventsCount,
            'widget_seen' => ($conversationCount + $widgetEventsCount) > 0,
            'manual_knowledge_count' => (int) $site['manual_knowledge_count'],
            'crawled_pages_count' => (int) $site['crawled_pages_count'],
            'knowledge_items_count' => $knowledgeCount,
            'active_crawl_sources_count' => (int) $site['active_crawl_sources_count'],
            'ai_requests_month' => $aiRequests,
            'ai_success_rate' => $aiSuccessRate,
            'last_conversation_at' => $site['last_conversation_at'],
            'last_widget_event_at' => $site['last_widget_event_at'],
            'last_activity_at' => $site['last_activity_at'],
            'last_crawl_status' => $site['last_crawl_status'],
            'last_crawl_at' => $site['last_crawl_at'],
            'health_status' => $healthStatus,
            'health_text' => $healthText,
            'install_code' => $installCode,
        ];
    }, $sites);

    $totalPages = $filteredTotal > 0
        ? (int) ceil($filteredTotal / $perPage)
        : 0;

    json_response([
        'success' => true,
        'sites' => $mappedSites,
        'summary' => [
            'total' => (int) ($summary['total'] ?? 0),
            'active' => (int) ($summary['active'] ?? 0),
            'inactive' => (int) ($summary['inactive'] ?? 0),
            'ai_enabled' => (int) ($summary['ai_enabled'] ?? 0),
            'conversations' => (int) ($summary['conversations'] ?? 0),
            'monthly_conversations' => (int) ($summary['monthly_conversations'] ?? 0),
            'healthy' => (int) ($summary['healthy'] ?? 0),
            'attention' => (int) ($summary['attention'] ?? 0),
        ],
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $filteredTotal,
            'total_pages' => $totalPages,
            'from' => $filteredTotal > 0 ? $offset + 1 : 0,
            'to' => min($offset + $perPage, $filteredTotal),
        ],
        'filters' => [
            'tenants' => array_map(static function (array $tenant): array {
                return [
                    'id' => (int) $tenant['id'],
                    'name' => $tenant['name'],
                    'status' => $tenant['status'],
                    'sites_count' => (int) $tenant['sites_count'],
                ];
            }, $tenantOptions),
        ],
        'applied_filters' => [
            'search' => $search,
            'tenant_id' => $tenantId,
            'status' => $status,
            'ai_mode' => $aiMode,
            'health' => $health,
            'sort' => $sort,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS] sites-list failed: ' . $e->getMessage());

    $payload = [
        'success' => false,
        'message' => 'Failed to load sites',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
