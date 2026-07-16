<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/ai-monitoring-stats.php
// هدف: گزارش خواندنی مصرف، کیفیت و خطاهای AI در کل پلتفرم

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
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

$days = isset($_GET['days']) ? (int) $_GET['days'] : 30;
$tenantId = isset($_GET['tenant_id']) ? (int) $_GET['tenant_id'] : 0;
$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;
$replyMode = isset($_GET['reply_mode'])
    ? trim((string) $_GET['reply_mode'])
    : '';

$allowedDays = [7, 30, 90];
$allowedModes = ['suggestion', 'auto_reply', 'fallback', 'no_answer'];

if (!in_array($days, $allowedDays, true)) {
    $days = 30;
}

if ($tenantId < 0) {
    $tenantId = 0;
}

if ($siteId < 0) {
    $siteId = 0;
}

if ($replyMode !== '' && !in_array($replyMode, $allowedModes, true)) {
    json_response([
        'success' => false,
        'message' => 'Invalid reply_mode'
    ], 422);
}

$startDate = date(
    'Y-m-d 00:00:00',
    strtotime('-' . ($days - 1) . ' days')
);
$todayStart = date('Y-m-d 00:00:00');

function ai_monitoring_where(
    string $alias,
    int $tenantId,
    int $siteId,
    string $replyMode,
    array &$params
): string {
    $where = "{$alias}.created_at >= :start_date AND {$alias}.request_source <> 'test'";

    if ($tenantId > 0) {
        $where .= " AND {$alias}.tenant_id = :tenant_id";
        $params[':tenant_id'] = $tenantId;
    }

    if ($siteId > 0) {
        $where .= " AND {$alias}.site_id = :site_id";
        $params[':site_id'] = $siteId;
    }

    if ($replyMode !== '') {
        $where .= " AND {$alias}.reply_mode = :reply_mode";
        $params[':reply_mode'] = $replyMode;
    }

    return $where;
}

try {
    $baseParams = [
        ':start_date' => $startDate,
    ];

    $baseWhere = ai_monitoring_where(
        'logs',
        $tenantId,
        $siteId,
        $replyMode,
        $baseParams
    );

    $summaryStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_requests,
            SUM(CASE WHEN logs.created_at >= :today_start THEN 1 ELSE 0 END) AS today_requests,
            SUM(CASE WHEN logs.reply_mode = 'suggestion' THEN 1 ELSE 0 END) AS suggestion_count,
            SUM(CASE WHEN logs.reply_mode = 'auto_reply' THEN 1 ELSE 0 END) AS auto_reply_count,
            SUM(CASE WHEN logs.reply_mode = 'fallback' THEN 1 ELSE 0 END) AS fallback_count,
            SUM(CASE WHEN logs.reply_mode = 'no_answer' THEN 1 ELSE 0 END) AS no_answer_count,
            SUM(CASE WHEN logs.reply_mode IN ('suggestion', 'auto_reply') THEN 1 ELSE 0 END) AS useful_count,
            SUM(
                CASE
                    WHEN logs.reply_mode IN ('suggestion', 'auto_reply')
                     AND logs.confidence_score >= COALESCE(settings.min_suggestion_score, 45)
                    THEN 1 ELSE 0
                END
            ) AS high_confidence_count,
            SUM(
                CASE
                    WHEN logs.reply_mode IN ('suggestion', 'auto_reply')
                     AND logs.confidence_score < COALESCE(settings.min_suggestion_score, 45)
                    THEN 1 ELSE 0
                END
            ) AS low_confidence_count,
            AVG(logs.confidence_score) AS average_confidence
        FROM ai_answer_logs AS logs
        LEFT JOIN ai_site_settings AS settings
            ON settings.tenant_id = logs.tenant_id
           AND settings.site_id = logs.site_id
        WHERE {$baseWhere}
    ");

    $summaryParams = $baseParams;
    $summaryParams[':today_start'] = $todayStart;
    $summaryStmt->execute($summaryParams);
    $summaryRow = $summaryStmt->fetch() ?: [];

    $totalRequests = (int) ($summaryRow['total_requests'] ?? 0);
    $usefulCount = (int) ($summaryRow['useful_count'] ?? 0);
    $noAnswerCount = (int) ($summaryRow['no_answer_count'] ?? 0);

    $summary = [
        'total_requests' => $totalRequests,
        'today_requests' => (int) ($summaryRow['today_requests'] ?? 0),
        'suggestion_count' => (int) ($summaryRow['suggestion_count'] ?? 0),
        'auto_reply_count' => (int) ($summaryRow['auto_reply_count'] ?? 0),
        'fallback_count' => (int) ($summaryRow['fallback_count'] ?? 0),
        'no_answer_count' => $noAnswerCount,
        'useful_count' => $usefulCount,
        'high_confidence_count' => (int) ($summaryRow['high_confidence_count'] ?? 0),
        'low_confidence_count' => (int) ($summaryRow['low_confidence_count'] ?? 0),
        'average_confidence' => round(
            (float) ($summaryRow['average_confidence'] ?? 0),
            1
        ),
        'useful_rate' => $totalRequests > 0
            ? round(($usefulCount / $totalRequests) * 100, 1)
            : 0.0,
        'no_answer_rate' => $totalRequests > 0
            ? round(($noAnswerCount / $totalRequests) * 100, 1)
            : 0.0,
    ];

    $trendStmt = $pdo->prepare("
        SELECT
            DATE(logs.created_at) AS report_date,
            COUNT(*) AS total,
            SUM(CASE WHEN logs.reply_mode = 'suggestion' THEN 1 ELSE 0 END) AS suggestion,
            SUM(CASE WHEN logs.reply_mode = 'auto_reply' THEN 1 ELSE 0 END) AS auto_reply,
            SUM(CASE WHEN logs.reply_mode = 'fallback' THEN 1 ELSE 0 END) AS fallback,
            SUM(CASE WHEN logs.reply_mode = 'no_answer' THEN 1 ELSE 0 END) AS no_answer,
            AVG(logs.confidence_score) AS average_confidence
        FROM ai_answer_logs AS logs
        WHERE {$baseWhere}
        GROUP BY DATE(logs.created_at)
        ORDER BY report_date ASC
    ");

    $trendStmt->execute($baseParams);
    $trendRows = $trendStmt->fetchAll();

    $trendMap = [];

    foreach ($trendRows as $row) {
        $trendMap[$row['report_date']] = [
            'total' => (int) $row['total'],
            'suggestion' => (int) $row['suggestion'],
            'auto_reply' => (int) $row['auto_reply'],
            'fallback' => (int) $row['fallback'],
            'no_answer' => (int) $row['no_answer'],
            'average_confidence' => round(
                (float) ($row['average_confidence'] ?? 0),
                1
            ),
        ];
    }

    $trend = [];

    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-{$i} days"));
        $values = $trendMap[$date] ?? [
            'total' => 0,
            'suggestion' => 0,
            'auto_reply' => 0,
            'fallback' => 0,
            'no_answer' => 0,
            'average_confidence' => 0.0,
        ];

        $trend[] = array_merge([
            'date' => $date,
            'label' => date('m/d', strtotime($date)),
        ], $values);
    }

    $modeStmt = $pdo->prepare("
        SELECT
            logs.reply_mode,
            COUNT(*) AS total
        FROM ai_answer_logs AS logs
        WHERE {$baseWhere}
        GROUP BY logs.reply_mode
    ");

    $modeStmt->execute($baseParams);
    $modeRows = $modeStmt->fetchAll();
    $modeMap = [];

    foreach ($modeRows as $row) {
        $modeMap[$row['reply_mode']] = (int) $row['total'];
    }

    $modeLabels = [
        'suggestion' => 'پیشنهاد پاسخ',
        'auto_reply' => 'پاسخ خودکار',
        'fallback' => 'پیام جایگزین',
        'no_answer' => 'بدون پاسخ',
    ];

    $modeDistribution = [];

    foreach ($allowedModes as $mode) {
        $count = $modeMap[$mode] ?? 0;

        $modeDistribution[] = [
            'mode' => $mode,
            'label' => $modeLabels[$mode],
            'total' => $count,
            'percentage' => $totalRequests > 0
                ? round(($count / $totalRequests) * 100, 1)
                : 0.0,
        ];
    }

    $tenantStmt = $pdo->prepare("
        SELECT
            tenants.id AS tenant_id,
            tenants.name AS tenant_name,
            tenants.status AS tenant_status,
            COUNT(logs.id) AS total_requests,
            SUM(CASE WHEN logs.reply_mode IN ('suggestion', 'auto_reply') THEN 1 ELSE 0 END) AS useful_count,
            SUM(CASE WHEN logs.reply_mode = 'no_answer' THEN 1 ELSE 0 END) AS no_answer_count,
            AVG(logs.confidence_score) AS average_confidence
        FROM ai_answer_logs AS logs
        INNER JOIN tenants ON tenants.id = logs.tenant_id
        WHERE {$baseWhere}
        GROUP BY tenants.id, tenants.name, tenants.status
        ORDER BY total_requests DESC, tenants.id DESC
        LIMIT 10
    ");

    $tenantStmt->execute($baseParams);
    $tenantRows = $tenantStmt->fetchAll();

    $topTenants = array_map(function ($row) {
        $total = (int) $row['total_requests'];
        $useful = (int) $row['useful_count'];
        $noAnswer = (int) $row['no_answer_count'];

        return [
            'tenant_id' => (int) $row['tenant_id'],
            'tenant_name' => $row['tenant_name'],
            'tenant_status' => $row['tenant_status'],
            'total_requests' => $total,
            'useful_count' => $useful,
            'no_answer_count' => $noAnswer,
            'average_confidence' => round(
                (float) ($row['average_confidence'] ?? 0),
                1
            ),
            'useful_rate' => $total > 0
                ? round(($useful / $total) * 100, 1)
                : 0.0,
            'no_answer_rate' => $total > 0
                ? round(($noAnswer / $total) * 100, 1)
                : 0.0,
        ];
    }, $tenantRows);

    $siteStatsSql = "
        SELECT
            sites.id AS site_id,
            sites.tenant_id,
            sites.name AS site_name,
            sites.domain,
            sites.is_active,
            tenants.name AS tenant_name,
            COALESCE(settings.assistant_enabled, 1) AS assistant_enabled,
            COALESCE(settings.auto_reply_enabled, 0) AS auto_reply_enabled,
            COALESCE(settings.min_suggestion_score, 45) AS min_suggestion_score,
            COALESCE(settings.min_auto_reply_score, 75) AS min_auto_reply_score,
            COUNT(logs.id) AS total_requests,
            SUM(CASE WHEN logs.reply_mode IN ('suggestion', 'auto_reply') THEN 1 ELSE 0 END) AS useful_count,
            SUM(CASE WHEN logs.reply_mode = 'no_answer' THEN 1 ELSE 0 END) AS no_answer_count,
            SUM(CASE WHEN logs.reply_mode = 'fallback' THEN 1 ELSE 0 END) AS fallback_count,
            AVG(logs.confidence_score) AS average_confidence,
            MAX(logs.created_at) AS last_request_at
        FROM ai_answer_logs AS logs
        INNER JOIN sites ON sites.id = logs.site_id
        INNER JOIN tenants ON tenants.id = logs.tenant_id
        LEFT JOIN ai_site_settings AS settings
            ON settings.tenant_id = logs.tenant_id
           AND settings.site_id = logs.site_id
        WHERE {$baseWhere}
        GROUP BY
            sites.id,
            sites.tenant_id,
            sites.name,
            sites.domain,
            sites.is_active,
            tenants.name,
            settings.assistant_enabled,
            settings.auto_reply_enabled,
            settings.min_suggestion_score,
            settings.min_auto_reply_score
    ";

    $siteStmt = $pdo->prepare("
        {$siteStatsSql}
        ORDER BY total_requests DESC, sites.id DESC
        LIMIT 12
    ");

    $siteStmt->execute($baseParams);
    $siteRows = $siteStmt->fetchAll();

    $mapSite = function ($row) {
        $total = (int) $row['total_requests'];
        $useful = (int) $row['useful_count'];
        $noAnswer = (int) $row['no_answer_count'];

        return [
            'site_id' => (int) $row['site_id'],
            'tenant_id' => (int) $row['tenant_id'],
            'site_name' => $row['site_name'],
            'domain' => $row['domain'],
            'tenant_name' => $row['tenant_name'],
            'is_active' => (bool) $row['is_active'],
            'assistant_enabled' => (bool) $row['assistant_enabled'],
            'auto_reply_enabled' => (bool) $row['auto_reply_enabled'],
            'min_suggestion_score' => (float) $row['min_suggestion_score'],
            'min_auto_reply_score' => (float) $row['min_auto_reply_score'],
            'total_requests' => $total,
            'useful_count' => $useful,
            'no_answer_count' => $noAnswer,
            'fallback_count' => (int) $row['fallback_count'],
            'average_confidence' => round(
                (float) ($row['average_confidence'] ?? 0),
                1
            ),
            'useful_rate' => $total > 0
                ? round(($useful / $total) * 100, 1)
                : 0.0,
            'no_answer_rate' => $total > 0
                ? round(($noAnswer / $total) * 100, 1)
                : 0.0,
            'last_request_at' => $row['last_request_at'],
        ];
    };

    $topSites = array_map($mapSite, $siteRows);

    $lowQualityStmt = $pdo->prepare("
        SELECT *
        FROM (
            {$siteStatsSql}
        ) AS quality
        WHERE
            quality.total_requests > 0
            AND (
                (
                    quality.useful_count / quality.total_requests
                ) < 0.60
                OR quality.average_confidence < 45
                OR (
                    quality.no_answer_count / quality.total_requests
                ) > 0.20
            )
        ORDER BY
            (
                quality.no_answer_count / quality.total_requests
            ) DESC,
            quality.average_confidence ASC,
            quality.total_requests DESC
        LIMIT 12
    ");

    $lowQualityStmt->execute($baseParams);
    $lowQualityRows = $lowQualityStmt->fetchAll();
    $lowQualitySites = array_map($mapSite, $lowQualityRows);

    $unansweredParams = [
        ':start_date' => $startDate,
    ];

    $unansweredWhere = "questions.last_seen_at >= :start_date AND questions.status = 'new'";

    if ($tenantId > 0) {
        $unansweredWhere .= " AND questions.tenant_id = :tenant_id";
        $unansweredParams[':tenant_id'] = $tenantId;
    }

    if ($siteId > 0) {
        $unansweredWhere .= " AND questions.site_id = :site_id";
        $unansweredParams[':site_id'] = $siteId;
    }

    $unansweredStmt = $pdo->prepare("
        SELECT
            questions.tenant_id,
            tenants.name AS tenant_name,
            questions.site_id,
            sites.name AS site_name,
            questions.question,
            MAX(questions.detected_category) AS detected_category,
            MAX(questions.detected_intent) AS detected_intent,
            SUM(questions.occurrence_count) AS occurrences,
            AVG(questions.best_match_score) AS average_best_match_score,
            MAX(questions.last_seen_at) AS last_seen_at
        FROM ai_unanswered_questions AS questions
        INNER JOIN tenants ON tenants.id = questions.tenant_id
        INNER JOIN sites ON sites.id = questions.site_id
        WHERE {$unansweredWhere}
        GROUP BY
            questions.tenant_id,
            tenants.name,
            questions.site_id,
            sites.name,
            questions.question
        ORDER BY occurrences DESC, last_seen_at DESC
        LIMIT 15
    ");

    $unansweredStmt->execute($unansweredParams);
    $unansweredRows = $unansweredStmt->fetchAll();

    $unansweredQuestions = array_map(function ($row) {
        return [
            'tenant_id' => (int) $row['tenant_id'],
            'tenant_name' => $row['tenant_name'],
            'site_id' => (int) $row['site_id'],
            'site_name' => $row['site_name'],
            'question' => $row['question'],
            'detected_category' => $row['detected_category'],
            'detected_intent' => $row['detected_intent'],
            'occurrences' => (int) $row['occurrences'],
            'average_best_match_score' => round(
                (float) ($row['average_best_match_score'] ?? 0),
                1
            ),
            'last_seen_at' => $row['last_seen_at'],
        ];
    }, $unansweredRows);

    $recentStmt = $pdo->prepare("
        SELECT
            logs.id,
            logs.tenant_id,
            tenants.name AS tenant_name,
            logs.site_id,
            sites.name AS site_name,
            logs.conversation_id,
            logs.user_question,
            logs.reply_text,
            logs.reply_mode,
            logs.request_source,
            logs.failure_reason,
            logs.confidence_score,
            logs.sources_json,
            logs.created_at
        FROM ai_answer_logs AS logs
        INNER JOIN tenants ON tenants.id = logs.tenant_id
        INNER JOIN sites ON sites.id = logs.site_id
        WHERE {$baseWhere}
        ORDER BY logs.id DESC
        LIMIT 20
    ");

    $recentStmt->execute($baseParams);
    $recentRows = $recentStmt->fetchAll();

    $recentLogs = array_map(function ($row) {
        $sourcesCount = 0;

        if (!empty($row['sources_json'])) {
            $sources = json_decode($row['sources_json'], true);

            if (is_array($sources)) {
                $sourcesCount = count($sources);
            }
        }

        return [
            'id' => (int) $row['id'],
            'tenant_id' => (int) $row['tenant_id'],
            'tenant_name' => $row['tenant_name'],
            'site_id' => (int) $row['site_id'],
            'site_name' => $row['site_name'],
            'conversation_id' => $row['conversation_id'] !== null
                ? (int) $row['conversation_id']
                : null,
            'user_question' => $row['user_question'],
            'reply_text' => $row['reply_text'],
            'reply_mode' => $row['reply_mode'],
            'request_source' => $row['request_source'],
            'failure_reason' => $row['failure_reason'],
            'confidence_score' => (float) $row['confidence_score'],
            'sources_count' => $sourcesCount,
            'created_at' => $row['created_at'],
        ];
    }, $recentRows);

    $tenantsStmt = $pdo->query("
        SELECT id, name, status
        FROM tenants
        ORDER BY name ASC, id ASC
    ");

    $tenantOptions = array_map(function ($tenant) {
        return [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'status' => $tenant['status'],
        ];
    }, $tenantsStmt->fetchAll());

    $sitesStmt = $pdo->query("
        SELECT id, tenant_id, name, domain, is_active
        FROM sites
        ORDER BY name ASC, id ASC
    ");

    $siteOptions = array_map(function ($site) {
        return [
            'id' => (int) $site['id'],
            'tenant_id' => (int) $site['tenant_id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
            'is_active' => (bool) $site['is_active'],
        ];
    }, $sitesStmt->fetchAll());

    json_response([
        'success' => true,
        'range' => [
            'days' => $days,
            'start_date' => $startDate,
            'end_date' => date('Y-m-d H:i:s'),
        ],
        'applied_filters' => [
            'tenant_id' => $tenantId,
            'site_id' => $siteId,
            'reply_mode' => $replyMode,
        ],
        'filters' => [
            'tenants' => $tenantOptions,
            'sites' => $siteOptions,
        ],
        'summary' => $summary,
        'trend' => $trend,
        'mode_distribution' => $modeDistribution,
        'top_tenants' => $topTenants,
        'top_sites' => $topSites,
        'low_quality_sites' => $lowQualitySites,
        'unanswered_questions' => $unansweredQuestions,
        'recent_logs' => $recentLogs,
        'generated_at' => date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to load AI monitoring statistics',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
