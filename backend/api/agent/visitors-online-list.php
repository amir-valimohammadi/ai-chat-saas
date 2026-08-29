<?php

// Messaging phase 6: live/idle/offline visitors with page and device context.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/visitor-presence.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin','agent']);

$q = trim((string) ($_GET['q'] ?? ''));
$status = trim((string) ($_GET['status'] ?? 'online'));
$device = trim((string) ($_GET['device'] ?? ''));
$siteId = isset($_GET['site_id']) && $_GET['site_id'] !== '' ? (int) $_GET['site_id'] : 0;
$page = max(1, (int) ($_GET['page'] ?? 1));
$limit = max(10, min(100, (int) ($_GET['limit'] ?? 50)));
$offset = ($page - 1) * $limit;

if (!in_array($status, ['online','idle','offline','all'], true) || !in_array($device, ['','desktop','mobile','tablet','bot','unknown'], true)) {
    json_response(['success' => false, 'message' => 'Invalid visitor filter'], 422);
}

$onlineSeconds = visitor_presence_online_seconds();
$idleSeconds = visitor_presence_idle_seconds();
$conditions = ['sites.tenant_id = :tenant_id'];
$params = [':tenant_id' => (int) $user['tenant_id']];
[$accessSql, $accessParams] = visitor_presence_access_condition($user, 'sites');
$conditions[] = $accessSql;
$params += $accessParams;

if ($siteId > 0) { $conditions[] = 'visitors.site_id = :site_id'; $params[':site_id'] = $siteId; }
if ($device !== '') { $conditions[] = 'visitors.device_type = :device'; $params[':device'] = $device; }
if ($q !== '') {
    $conditions[] = '(visitors.name LIKE :q_name OR visitors.email LIKE :q_email OR visitors.phone LIKE :q_phone OR visitors.current_page_title LIKE :q_title OR visitors.current_page_url LIKE :q_url OR visitors.browser_id LIKE :q_browser_id)';
    foreach (['q_name','q_email','q_phone','q_title','q_url','q_browser_id'] as $key) $params[':' . $key] = '%' . $q . '%';
}
if ($status === 'online') $conditions[] = "visitors.last_seen_at >= DATE_SUB(NOW(), INTERVAL {$onlineSeconds} SECOND)";
elseif ($status === 'idle') $conditions[] = "visitors.last_seen_at < DATE_SUB(NOW(), INTERVAL {$onlineSeconds} SECOND) AND visitors.last_seen_at >= DATE_SUB(NOW(), INTERVAL {$idleSeconds} SECOND)";
elseif ($status === 'offline') $conditions[] = "(visitors.last_seen_at IS NULL OR visitors.last_seen_at < DATE_SUB(NOW(), INTERVAL {$idleSeconds} SECOND))";

$where = implode(' AND ', $conditions);

try {
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM visitors INNER JOIN sites ON sites.id = visitors.site_id WHERE {$where}");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $stmt = $pdo->prepare("\n        SELECT visitors.*, sites.name AS site_name,\n               latest_session.id AS session_id, latest_session.started_at AS session_started_at,\n               latest_session.last_seen_at AS session_last_seen_at, latest_session.page_view_count,\n               latest_session.total_active_seconds, latest_session.widget_open, latest_session.is_active,\n               (SELECT c.id FROM conversations c WHERE c.visitor_id = visitors.id AND c.status <> 'closed' ORDER BY c.id DESC LIMIT 1) AS active_conversation_id,\n               (SELECT COUNT(*) FROM visitor_operator_invites voi WHERE voi.visitor_id = visitors.id AND voi.status IN ('pending','delivered') AND voi.expires_at > NOW()) AS pending_invite_count\n        FROM visitors\n        INNER JOIN sites ON sites.id = visitors.site_id\n        LEFT JOIN visitor_sessions latest_session ON latest_session.id = (\n            SELECT vs.id FROM visitor_sessions vs WHERE vs.visitor_id = visitors.id ORDER BY vs.last_seen_at DESC, vs.id DESC LIMIT 1\n        )\n        WHERE {$where}\n        ORDER BY visitors.last_seen_at DESC, visitors.id DESC\n        LIMIT {$limit} OFFSET {$offset}\n    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $siteConditions = ['sites.tenant_id = :tenant_id'];
    $siteParams = [':tenant_id' => (int) $user['tenant_id']];
    [$siteAccessSql, $siteAccessParams] = visitor_presence_access_condition($user, 'sites');
    $siteConditions[] = $siteAccessSql;
    $siteParams += $siteAccessParams;
    $sitesStmt = $pdo->prepare('SELECT sites.id, sites.name FROM sites WHERE ' . implode(' AND ', $siteConditions) . ' AND sites.is_active = 1 ORDER BY sites.name');
    $sitesStmt->execute($siteParams);

    $statsStmt = $pdo->prepare("\n        SELECT\n          SUM(visitors.last_seen_at >= DATE_SUB(NOW(), INTERVAL {$onlineSeconds} SECOND)) AS online_count,\n          SUM(visitors.last_seen_at < DATE_SUB(NOW(), INTERVAL {$onlineSeconds} SECOND) AND visitors.last_seen_at >= DATE_SUB(NOW(), INTERVAL {$idleSeconds} SECOND)) AS idle_count,\n          SUM(visitors.last_seen_at IS NULL OR visitors.last_seen_at < DATE_SUB(NOW(), INTERVAL {$idleSeconds} SECOND)) AS offline_count\n        FROM visitors INNER JOIN sites ON sites.id = visitors.site_id\n        WHERE sites.tenant_id = :tenant_id AND {$accessSql}\n    ");
    $statsStmt->execute(array_merge([':tenant_id' => (int) $user['tenant_id']], $accessParams));
    $stats = $statsStmt->fetch() ?: [];

    json_response([
        'success' => true,
        'visitors' => array_map(static function (array $row): array {
            $presence = visitor_presence_status($row['last_seen_at']);
            return [
                'id' => (int) $row['id'], 'site' => ['id' => (int) $row['site_id'], 'name' => $row['site_name']],
                'name' => $row['name'], 'email' => $row['email'], 'phone' => $row['phone'],
                'browser_id' => $row['browser_id'], 'first_seen_at' => $row['first_seen_at'], 'last_seen_at' => $row['last_seen_at'],
                'presence_status' => $presence, 'is_online' => $presence === 'online',
                'current_page_url' => $row['current_page_url'], 'current_page_title' => $row['current_page_title'], 'referrer_url' => $row['referrer_url'],
                'device_type' => $row['device_type'], 'browser_name' => $row['browser_name'], 'operating_system' => $row['operating_system'],
                'session_count' => (int) $row['session_count'],
                'session' => $row['session_id'] ? [
                    'id' => (int) $row['session_id'], 'started_at' => $row['session_started_at'], 'last_seen_at' => $row['session_last_seen_at'],
                    'page_view_count' => (int) $row['page_view_count'], 'total_active_seconds' => (int) $row['total_active_seconds'],
                    'widget_open' => (bool) $row['widget_open'], 'is_active' => (bool) $row['is_active'],
                ] : null,
                'active_conversation_id' => $row['active_conversation_id'] !== null ? (int) $row['active_conversation_id'] : null,
                'pending_invite_count' => (int) $row['pending_invite_count'],
            ];
        }, $rows),
        'sites' => array_map(static fn(array $site): array => ['id' => (int) $site['id'], 'name' => $site['name']], $sitesStmt->fetchAll()),
        'stats' => ['online' => (int) ($stats['online_count'] ?? 0), 'idle' => (int) ($stats['idle_count'] ?? 0), 'offline' => (int) ($stats['offline_count'] ?? 0)],
        'pagination' => ['page' => $page, 'limit' => $limit, 'total' => $total, 'pages' => max(1, (int) ceil($total / $limit))],
        'thresholds' => ['online_seconds' => $onlineSeconds, 'idle_seconds' => $idleSeconds],
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load visitors'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
