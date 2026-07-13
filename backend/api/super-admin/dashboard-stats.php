<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/dashboard-stats.php
// هدف: آمار تجمیعی و واقعی داشبورد Super Admin

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

try {
    $summaryStmt = $pdo->query("
        SELECT
            (SELECT COUNT(*) FROM tenants) AS tenants_total,
            (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS tenants_active,
            (SELECT COUNT(*) FROM tenants WHERE status = 'inactive') AS tenants_inactive,
            (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') AS tenants_suspended,
            (SELECT COUNT(*) FROM sites) AS sites_total,
            (SELECT COUNT(*) FROM sites WHERE is_active = 1) AS sites_active,
            (SELECT COUNT(*) FROM users) AS users_total,
            (SELECT COUNT(*) FROM users WHERE role = 'agent' AND is_active = 1) AS agents_total,
            (SELECT COUNT(*) FROM conversations WHERE created_at >= CURDATE()) AS conversations_today,
            (SELECT COUNT(*) FROM messages WHERE created_at >= CURDATE()) AS messages_today,
            (SELECT COUNT(*) FROM ai_answer_logs WHERE created_at >= CURDATE()) AS ai_requests_today,
            (
                SELECT COUNT(*)
                FROM ai_answer_logs
                WHERE created_at >= CURDATE()
                  AND reply_mode = 'no_answer'
            ) AS ai_no_answer_today,
            (
                SELECT COUNT(*)
                FROM ai_answer_logs
                WHERE created_at >= CURDATE()
                  AND reply_mode IN ('suggestion', 'auto_reply')
            ) AS ai_successful_today
    ");

    $summaryRow = $summaryStmt->fetch() ?: [];

    $aiRequestsToday = (int) ($summaryRow['ai_requests_today'] ?? 0);
    $aiSuccessfulToday = (int) ($summaryRow['ai_successful_today'] ?? 0);
    $aiSuccessRate = $aiRequestsToday > 0
        ? round(($aiSuccessfulToday / $aiRequestsToday) * 100, 1)
        : 0.0;

    $healthStmt = $pdo->query("
        SELECT
            (SELECT COUNT(*) FROM plans WHERE is_active = 1) AS active_plans,
            (SELECT COUNT(*) FROM sites WHERE is_active = 0) AS inactive_sites,
            (
                SELECT COUNT(*)
                FROM users
                WHERE role IN ('customer_admin', 'agent')
                  AND is_active = 1
                  AND availability_status = 'online'
                  AND last_seen_at IS NOT NULL
                  AND last_seen_at >= (NOW() - INTERVAL 2 MINUTE)
            ) AS online_support_users
    ");

    $healthRow = $healthStmt->fetch() ?: [];

    $trendStart = (new DateTimeImmutable('today'))->modify('-6 days');
    $trendStartSql = $trendStart->format('Y-m-d 00:00:00');

    $conversationTrendStmt = $pdo->prepare("
        SELECT DATE(created_at) AS activity_date, COUNT(*) AS total
        FROM conversations
        WHERE created_at >= :trend_start
        GROUP BY DATE(created_at)
    ");
    $conversationTrendStmt->execute([':trend_start' => $trendStartSql]);

    $messageTrendStmt = $pdo->prepare("
        SELECT DATE(created_at) AS activity_date, COUNT(*) AS total
        FROM messages
        WHERE created_at >= :trend_start
        GROUP BY DATE(created_at)
    ");
    $messageTrendStmt->execute([':trend_start' => $trendStartSql]);

    $aiTrendStmt = $pdo->prepare("
        SELECT DATE(created_at) AS activity_date, COUNT(*) AS total
        FROM ai_answer_logs
        WHERE created_at >= :trend_start
        GROUP BY DATE(created_at)
    ");
    $aiTrendStmt->execute([':trend_start' => $trendStartSql]);

    $mapTrendRows = static function (array $rows): array {
        $result = [];

        foreach ($rows as $row) {
            $date = (string) ($row['activity_date'] ?? '');

            if ($date !== '') {
                $result[$date] = (int) ($row['total'] ?? 0);
            }
        }

        return $result;
    };

    $conversationTrend = $mapTrendRows($conversationTrendStmt->fetchAll());
    $messageTrend = $mapTrendRows($messageTrendStmt->fetchAll());
    $aiTrend = $mapTrendRows($aiTrendStmt->fetchAll());

    $trend = [];

    for ($offset = 0; $offset < 7; $offset++) {
        $date = $trendStart->modify('+' . $offset . ' days')->format('Y-m-d');

        $trend[] = [
            'date' => $date,
            'conversations' => $conversationTrend[$date] ?? 0,
            'messages' => $messageTrend[$date] ?? 0,
            'ai_requests' => $aiTrend[$date] ?? 0,
        ];
    }

    $latestTenantsStmt = $pdo->query("
        SELECT
            tenants.id,
            tenants.name,
            tenants.owner_name,
            tenants.owner_email,
            tenants.status,
            tenants.created_at,
            plans.name AS plan_name,
            (
                SELECT COUNT(*)
                FROM sites
                WHERE sites.tenant_id = tenants.id
            ) AS sites_count,
            (
                SELECT COUNT(*)
                FROM users
                WHERE users.tenant_id = tenants.id
            ) AS users_count
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        ORDER BY tenants.id DESC
        LIMIT 6
    ");

    $latestTenants = array_map(static function (array $tenant): array {
        return [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'owner_name' => $tenant['owner_name'],
            'owner_email' => $tenant['owner_email'],
            'status' => $tenant['status'],
            'plan_name' => $tenant['plan_name'],
            'sites_count' => (int) $tenant['sites_count'],
            'users_count' => (int) $tenant['users_count'],
            'created_at' => $tenant['created_at'],
        ];
    }, $latestTenantsStmt->fetchAll());

    $planUsageStmt = $pdo->query("
        SELECT
            tenants.id,
            tenants.name,
            tenants.status,
            plans.name AS plan_name,
            plans.max_monthly_conversations,
            COUNT(conversations.id) AS monthly_conversations
        FROM tenants
        INNER JOIN plans ON plans.id = tenants.plan_id
        LEFT JOIN sites ON sites.tenant_id = tenants.id
        LEFT JOIN conversations
            ON conversations.site_id = sites.id
           AND conversations.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        WHERE tenants.status = 'active'
          AND plans.max_monthly_conversations > 0
        GROUP BY
            tenants.id,
            tenants.name,
            tenants.status,
            plans.name,
            plans.max_monthly_conversations
    ");

    $planAlerts = [];

    foreach ($planUsageStmt->fetchAll() as $item) {
        $limit = (int) $item['max_monthly_conversations'];
        $used = (int) $item['monthly_conversations'];
        $usagePercent = $limit > 0 ? round(($used / $limit) * 100, 1) : 0.0;

        if ($usagePercent < 70) {
            continue;
        }

        $level = 'warning';

        if ($usagePercent >= 100) {
            $level = 'critical';
        } elseif ($usagePercent >= 90) {
            $level = 'danger';
        }

        $planAlerts[] = [
            'id' => (int) $item['id'],
            'name' => $item['name'],
            'plan_name' => $item['plan_name'],
            'monthly_conversations' => $used,
            'limit' => $limit,
            'usage_percent' => $usagePercent,
            'level' => $level,
        ];
    }

    usort($planAlerts, static function (array $first, array $second): int {
        return $second['usage_percent'] <=> $first['usage_percent'];
    });

    $planAlerts = array_slice($planAlerts, 0, 6);

    json_response([
        'success' => true,
        'generated_at' => date('Y-m-d H:i:s'),
        'summary' => [
            'tenants_total' => (int) ($summaryRow['tenants_total'] ?? 0),
            'tenants_active' => (int) ($summaryRow['tenants_active'] ?? 0),
            'tenants_inactive' => (int) ($summaryRow['tenants_inactive'] ?? 0),
            'tenants_suspended' => (int) ($summaryRow['tenants_suspended'] ?? 0),
            'sites_total' => (int) ($summaryRow['sites_total'] ?? 0),
            'sites_active' => (int) ($summaryRow['sites_active'] ?? 0),
            'users_total' => (int) ($summaryRow['users_total'] ?? 0),
            'agents_total' => (int) ($summaryRow['agents_total'] ?? 0),
            'conversations_today' => (int) ($summaryRow['conversations_today'] ?? 0),
            'messages_today' => (int) ($summaryRow['messages_today'] ?? 0),
            'ai_requests_today' => $aiRequestsToday,
            'ai_no_answer_today' => (int) ($summaryRow['ai_no_answer_today'] ?? 0),
            'ai_success_rate' => $aiSuccessRate,
        ],
        'health' => [
            'database_status' => 'online',
            'active_plans' => (int) ($healthRow['active_plans'] ?? 0),
            'inactive_sites' => (int) ($healthRow['inactive_sites'] ?? 0),
            'online_support_users' => (int) ($healthRow['online_support_users'] ?? 0),
        ],
        'trend' => $trend,
        'latest_tenants' => $latestTenants,
        'plan_alerts' => $planAlerts,
    ]);
} catch (Throwable $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to load dashboard statistics',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
