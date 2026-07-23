<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/reports-summary.php
// هدف: گزارش مینیمال آماری برای پنل مشتری

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
require_role($user, ['customer_admin']);

$days = isset($_GET['days']) ? (int) $_GET['days'] : 7;
$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;

$allowedDays = [7, 30, 90];

if (!in_array($days, $allowedDays, true)) {
    $days = 7;
}

$startDate = date('Y-m-d 00:00:00', strtotime('-' . ($days - 1) . ' days'));
$todayStart = date('Y-m-d 00:00:00');

try {
    $sitesStmt = $pdo->prepare("
        SELECT id, name, domain
        FROM sites
        WHERE tenant_id = :tenant_id
        ORDER BY id DESC
    ");

    $sitesStmt->execute([
        ':tenant_id' => $user['tenant_id'],
    ]);

    $sites = $sitesStmt->fetchAll();

    $baseWhere = "
        sites.tenant_id = :tenant_id
        AND conversations.created_at >= :start_date
    ";

    $baseParams = [
        ':tenant_id' => $user['tenant_id'],
        ':start_date' => $startDate,
    ];

    if ($siteId > 0) {
        $baseWhere .= " AND sites.id = :site_id ";
        $baseParams[':site_id'] = $siteId;
    }

    $metricsStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_conversations,
            SUM(CASE WHEN conversations.created_at >= :today_start THEN 1 ELSE 0 END) AS today_conversations,
            SUM(CASE WHEN conversations.status IN ('new', 'open', 'pending') THEN 1 ELSE 0 END) AS active_conversations,
            SUM(CASE WHEN conversations.status = 'closed' THEN 1 ELSE 0 END) AS closed_conversations
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE {$baseWhere}
    ");

    $metricsParams = $baseParams;
    $metricsParams[':today_start'] = $todayStart;

    $metricsStmt->execute($metricsParams);
    $metrics = $metricsStmt->fetch();

    $messagesStmt = $pdo->prepare("
        SELECT COUNT(*) AS total_messages
        FROM messages
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
          AND messages.created_at >= :start_date
          AND messages.message_type <> 'internal_note'
          " . ($siteId > 0 ? " AND sites.id = :site_id " : "") . "
    ");

    $messagesStmt->execute($baseParams);
    $messagesData = $messagesStmt->fetch();

    $attachmentsStmt = $pdo->prepare("
        SELECT COUNT(*) AS total_attachments
        FROM message_attachments
        INNER JOIN messages ON messages.id = message_attachments.message_id
        INNER JOIN conversations ON conversations.id = messages.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
          AND message_attachments.created_at >= :start_date
          " . ($siteId > 0 ? " AND sites.id = :site_id " : "") . "
    ");

    $attachmentsStmt->execute($baseParams);
    $attachmentsData = $attachmentsStmt->fetch();

    $avgResponseStmt = $pdo->prepare("
        SELECT AVG(
            TIMESTAMPDIFF(
                MINUTE,
                (
                    SELECT MIN(m1.created_at)
                    FROM messages m1
                    WHERE m1.conversation_id = conversations.id
                      AND m1.sender_type = 'visitor'
                ),
                (
                    SELECT MIN(m2.created_at)
                    FROM messages m2
                    WHERE m2.conversation_id = conversations.id
                      AND m2.sender_type = 'agent'
                      AND m2.message_type <> 'internal_note'
                )
            )
        ) AS avg_first_response_minutes
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE {$baseWhere}
          AND EXISTS (
              SELECT 1 FROM messages mv
              WHERE mv.conversation_id = conversations.id
                AND mv.sender_type = 'visitor'
          )
          AND EXISTS (
              SELECT 1 FROM messages ma
              WHERE ma.conversation_id = conversations.id
                AND ma.sender_type = 'agent'
                AND ma.message_type <> 'internal_note'
          )
    ");

    $avgResponseStmt->execute($baseParams);
    $avgResponseData = $avgResponseStmt->fetch();

    $dailyStmt = $pdo->prepare("
        SELECT
            DATE(conversations.created_at) AS report_date,
            COUNT(*) AS total
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE {$baseWhere}
        GROUP BY DATE(conversations.created_at)
        ORDER BY report_date ASC
    ");

    $dailyStmt->execute($baseParams);
    $dailyRows = $dailyStmt->fetchAll();

    $dailyMap = [];

    foreach ($dailyRows as $row) {
        $dailyMap[$row['report_date']] = (int) $row['total'];
    }

    $daily = [];

    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-{$i} days"));

        $daily[] = [
            'date' => $date,
            'label' => date('m/d', strtotime($date)),
            'total' => $dailyMap[$date] ?? 0,
        ];
    }

    $statusStmt = $pdo->prepare("
        SELECT
            conversations.status,
            COUNT(*) AS total
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE {$baseWhere}
        GROUP BY conversations.status
    ");

    $statusStmt->execute($baseParams);
    $statusRows = $statusStmt->fetchAll();

    $statusLabels = [
        'new' => 'جدید',
        'open' => 'باز',
        'pending' => 'در انتظار',
        'closed' => 'بسته‌شده',
    ];

    $statusCounts = array_map(function ($row) use ($statusLabels) {
        return [
            'status' => $row['status'],
            'label' => $statusLabels[$row['status']] ?? $row['status'],
            'total' => (int) $row['total'],
        ];
    }, $statusRows);

    $siteCountsStmt = $pdo->prepare("
        SELECT
            sites.id,
            sites.name,
            COUNT(conversations.id) AS total
        FROM sites
        LEFT JOIN conversations
            ON conversations.site_id = sites.id
            AND conversations.created_at >= :start_date
        WHERE sites.tenant_id = :tenant_id
          " . ($siteId > 0 ? " AND sites.id = :site_id " : "") . "
        GROUP BY sites.id, sites.name
        ORDER BY total DESC, sites.id DESC
    ");

    $siteCountsStmt->execute($baseParams);
    $siteCounts = $siteCountsStmt->fetchAll();

    $recentStmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.status,
            conversations.last_message_at,
            conversations.created_at,
            sites.name AS site_name,
            visitors.name AS visitor_name,
            visitors.phone AS visitor_phone,
            visitors.email AS visitor_email,
            (
                SELECT content
                FROM messages
                WHERE messages.conversation_id = conversations.id
                ORDER BY messages.id DESC
                LIMIT 1
            ) AS last_message
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        WHERE {$baseWhere}
        ORDER BY conversations.last_message_at DESC, conversations.id DESC
        LIMIT 8
    ");

    $recentStmt->execute($baseParams);
    $recentRows = $recentStmt->fetchAll();

    json_response([
        'success' => true,
        'range' => [
            'days' => $days,
            'start_date' => $startDate,
            'end_date' => date('Y-m-d H:i:s'),
        ],
        'filters' => [
            'site_id' => $siteId,
        ],
        'sites' => array_map(function ($site) {
            return [
                'id' => (int) $site['id'],
                'name' => $site['name'],
                'domain' => $site['domain'],
            ];
        }, $sites),
        'metrics' => [
            'total_conversations' => (int) ($metrics['total_conversations'] ?? 0),
            'today_conversations' => (int) ($metrics['today_conversations'] ?? 0),
            'active_conversations' => (int) ($metrics['active_conversations'] ?? 0),
            'closed_conversations' => (int) ($metrics['closed_conversations'] ?? 0),
            'total_messages' => (int) ($messagesData['total_messages'] ?? 0),
            'total_attachments' => (int) ($attachmentsData['total_attachments'] ?? 0),
            'avg_first_response_minutes' => $avgResponseData['avg_first_response_minutes'] !== null
                ? round((float) $avgResponseData['avg_first_response_minutes'], 1)
                : null,
        ],
        'daily' => $daily,
        'status_counts' => $statusCounts,
        'site_counts' => array_map(function ($row) {
            return [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'total' => (int) $row['total'],
            ];
        }, $siteCounts),
        'recent_conversations' => array_map(function ($row) {
            return [
                'id' => (int) $row['id'],
                'status' => $row['status'],
                'site_name' => $row['site_name'],
                'visitor_name' => $row['visitor_name'],
                'visitor_phone' => $row['visitor_phone'],
                'visitor_email' => $row['visitor_email'],
                'last_message' => $row['last_message'],
                'last_message_at' => $row['last_message_at'],
                'created_at' => $row['created_at'],
            ];
        }, $recentRows),
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load reports',
        'error' => $e->getMessage()
    ], 500);
}