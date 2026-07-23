<?php

// Messaging phase 6: anonymous visitor/session heartbeat, page-view tracking and invite delivery.

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/visitor-presence.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$siteKey = trim((string) ($input['site_key'] ?? ''));
$browserId = trim((string) ($input['browser_id'] ?? ''));
$sessionKey = trim((string) ($input['session_key'] ?? ''));
$pageUrl = visitor_presence_url((string) ($input['page_url'] ?? ''));
$pageTitle = visitor_presence_text((string) ($input['page_title'] ?? ''), 255);
$referrerUrl = visitor_presence_url((string) ($input['referrer_url'] ?? ''));
$event = trim((string) ($input['event'] ?? 'heartbeat'));
$widgetOpen = !empty($input['widget_open']);

if ($siteKey === '' || $browserId === '' || $sessionKey === '') {
    json_response(['success' => false, 'message' => 'site_key, browser_id and session_key are required'], 422);
}
if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey) || mb_strlen($browserId, 'UTF-8') > 120 || mb_strlen($sessionKey, 'UTF-8') > 120) {
    json_response(['success' => false, 'message' => 'Invalid presence identity'], 422);
}
if (!in_array($event, ['heartbeat', 'page_view', 'close'], true)) {
    $event = 'heartbeat';
}

enforce_rate_limit(
    $pdo,
    'widget_visitor_heartbeat',
    rate_limit_identifier($siteKey . '|' . $browserId . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    180,
    60,
    'Too many presence updates. Please slow down.'
);

try {
    $siteStmt = $pdo->prepare("\n        SELECT sites.id, sites.tenant_id, sites.domain\n        FROM sites\n        INNER JOIN tenants ON tenants.id = sites.tenant_id\n        WHERE sites.site_key = :site_key AND sites.is_active = 1 AND tenants.status = 'active'\n        LIMIT 1\n    ");
    $siteStmt->execute([':site_key' => $siteKey]);
    $site = $siteStmt->fetch();
    if (!$site) json_response(['success' => false, 'message' => 'Site not found'], 404);

    validate_widget_origin_or_fail($site['domain']);
    $siteId = (int) $site['id'];
    $userAgent = mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500, 'UTF-8');
    $metadata = visitor_presence_parse_user_agent($userAgent);
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;

    $pdo->beginTransaction();

    $visitorStmt = $pdo->prepare("SELECT * FROM visitors WHERE site_id = :site_id AND browser_id = :browser_id LIMIT 1 FOR UPDATE");
    $visitorStmt->execute([':site_id' => $siteId, ':browser_id' => $browserId]);
    $visitor = $visitorStmt->fetch();

    if ($visitor) {
        $visitorId = (int) $visitor['id'];
        $updateVisitor = $pdo->prepare("\n            UPDATE visitors SET\n              ip_address = :ip_address, user_agent = :user_agent,\n              first_seen_at = COALESCE(first_seen_at, created_at), last_seen_at = NOW(),\n              current_page_url = COALESCE(:page_url, current_page_url),\n              current_page_title = COALESCE(:page_title, current_page_title),\n              referrer_url = COALESCE(referrer_url, :referrer_url),\n              device_type = :device_type, browser_name = :browser_name, operating_system = :operating_system\n            WHERE id = :id\n        ");
        $updateVisitor->execute([
            ':ip_address' => $ipAddress, ':user_agent' => $userAgent,
            ':page_url' => $pageUrl, ':page_title' => $pageTitle, ':referrer_url' => $referrerUrl,
            ':device_type' => $metadata['device_type'], ':browser_name' => $metadata['browser_name'],
            ':operating_system' => $metadata['operating_system'], ':id' => $visitorId,
        ]);
    } else {
        $insertVisitor = $pdo->prepare("\n            INSERT INTO visitors (\n              site_id, browser_id, ip_address, user_agent, first_seen_at, last_seen_at,\n              current_page_url, current_page_title, referrer_url, device_type, browser_name, operating_system, session_count\n            ) VALUES (\n              :site_id, :browser_id, :ip_address, :user_agent, NOW(), NOW(),\n              :page_url, :page_title, :referrer_url, :device_type, :browser_name, :operating_system, 0\n            )\n        ");
        $insertVisitor->execute([
            ':site_id' => $siteId, ':browser_id' => $browserId, ':ip_address' => $ipAddress, ':user_agent' => $userAgent,
            ':page_url' => $pageUrl, ':page_title' => $pageTitle, ':referrer_url' => $referrerUrl,
            ':device_type' => $metadata['device_type'], ':browser_name' => $metadata['browser_name'],
            ':operating_system' => $metadata['operating_system'],
        ]);
        $visitorId = (int) $pdo->lastInsertId();
    }

    $sessionStmt = $pdo->prepare("SELECT * FROM visitor_sessions WHERE site_id = :site_id AND session_key = :session_key LIMIT 1 FOR UPDATE");
    $sessionStmt->execute([':site_id' => $siteId, ':session_key' => $sessionKey]);
    $session = $sessionStmt->fetch();

    if (!$session) {
        $insertSession = $pdo->prepare("\n            INSERT INTO visitor_sessions (\n              site_id, visitor_id, session_key, first_page_url, last_page_url, last_page_title, referrer_url,\n              device_type, browser_name, operating_system, page_view_count, widget_open, is_active, started_at, last_seen_at\n            ) VALUES (\n              :site_id, :visitor_id, :session_key, :first_page_url, :last_page_url, :last_page_title, :referrer_url,\n              :device_type, :browser_name, :operating_system, 0, :widget_open, 1, NOW(), NOW()\n            )\n        ");
        $insertSession->execute([
            ':site_id' => $siteId, ':visitor_id' => $visitorId, ':session_key' => $sessionKey,
            ':first_page_url' => $pageUrl, ':last_page_url' => $pageUrl, ':last_page_title' => $pageTitle,
            ':referrer_url' => $referrerUrl, ':device_type' => $metadata['device_type'],
            ':browser_name' => $metadata['browser_name'], ':operating_system' => $metadata['operating_system'],
            ':widget_open' => $widgetOpen ? 1 : 0,
        ]);
        $sessionId = (int) $pdo->lastInsertId();
        $pdo->prepare("UPDATE visitors SET session_count = session_count + 1 WHERE id = :id")->execute([':id' => $visitorId]);
        $previousPageUrl = null;
    } else {
        $sessionId = (int) $session['id'];
        $previousPageUrl = $session['last_page_url'];
        $closeSession = $event === 'close';
        $updateSession = $pdo->prepare("\n            UPDATE visitor_sessions SET\n              visitor_id = :visitor_id,\n              total_active_seconds = total_active_seconds + LEAST(60, GREATEST(0, TIMESTAMPDIFF(SECOND, last_seen_at, NOW()))),\n              last_page_url = COALESCE(:last_page_url, last_page_url),\n              last_page_title = COALESCE(:last_page_title, last_page_title),\n              widget_open = :widget_open,\n              is_active = :is_active,\n              ended_at = CASE WHEN :is_closing = 1 THEN NOW() ELSE NULL END,\n              last_seen_at = NOW()\n            WHERE id = :id\n        ");
        $updateSession->execute([
            ':visitor_id' => $visitorId, ':last_page_url' => $pageUrl, ':last_page_title' => $pageTitle,
            ':widget_open' => $widgetOpen ? 1 : 0, ':is_active' => $closeSession ? 0 : 1,
            ':is_closing' => $closeSession ? 1 : 0, ':id' => $sessionId,
        ]);
    }

    if ($pageUrl !== null && ($previousPageUrl === null || $previousPageUrl !== $pageUrl)) {
        $pdo->prepare("\n            UPDATE visitor_page_views SET\n              duration_seconds = GREATEST(duration_seconds, TIMESTAMPDIFF(SECOND, entered_at, NOW())),\n              last_seen_at = NOW(), is_current = 0\n            WHERE session_id = :session_id AND is_current = 1\n        ")->execute([':session_id' => $sessionId]);

        $insertPage = $pdo->prepare("\n            INSERT INTO visitor_page_views (session_id, site_id, visitor_id, page_url, page_title, referrer_url)\n            VALUES (:session_id, :site_id, :visitor_id, :page_url, :page_title, :referrer_url)\n        ");
        $insertPage->execute([
            ':session_id' => $sessionId, ':site_id' => $siteId, ':visitor_id' => $visitorId,
            ':page_url' => $pageUrl, ':page_title' => $pageTitle, ':referrer_url' => $referrerUrl,
        ]);
        $pdo->prepare("UPDATE visitor_sessions SET page_view_count = page_view_count + 1 WHERE id = :id")->execute([':id' => $sessionId]);
    } elseif ($pageUrl !== null) {
        $pdo->prepare("\n            UPDATE visitor_page_views SET\n              duration_seconds = GREATEST(duration_seconds, TIMESTAMPDIFF(SECOND, entered_at, NOW())),\n              last_seen_at = NOW()\n            WHERE session_id = :session_id AND is_current = 1\n        ")->execute([':session_id' => $sessionId]);
    }

    if ($event === 'close') {
        $pdo->prepare("UPDATE visitor_page_views SET is_current = 0, last_seen_at = NOW(), duration_seconds = GREATEST(duration_seconds, TIMESTAMPDIFF(SECOND, entered_at, NOW())) WHERE session_id = :session_id AND is_current = 1")
            ->execute([':session_id' => $sessionId]);
    }

    $pdo->prepare("UPDATE visitor_sessions SET is_active = 0, ended_at = COALESCE(ended_at, last_seen_at) WHERE site_id = :site_id AND is_active = 1 AND last_seen_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)")
        ->execute([':site_id' => $siteId]);
    $pdo->prepare("UPDATE visitor_operator_invites SET status = 'expired', responded_at = NOW() WHERE visitor_id = :visitor_id AND status IN ('pending','delivered') AND expires_at <= NOW()")
        ->execute([':visitor_id' => $visitorId]);

    $inviteStmt = $pdo->prepare("\n        SELECT voi.id, voi.conversation_id, voi.message_preview, voi.expires_at,\n               departments.id AS department_id, departments.name AS department_name, departments.color AS department_color,\n               users.id AS operator_id, users.name AS operator_name\n        FROM visitor_operator_invites voi\n        LEFT JOIN departments ON departments.id = voi.department_id\n        INNER JOIN users ON users.id = voi.operator_id\n        WHERE voi.visitor_id = :visitor_id AND voi.site_id = :site_id\n          AND voi.status IN ('pending','delivered') AND voi.expires_at > NOW()\n        ORDER BY voi.id DESC LIMIT 1 FOR UPDATE\n    ");
    $inviteStmt->execute([':visitor_id' => $visitorId, ':site_id' => $siteId]);
    $invite = $inviteStmt->fetch();
    if ($invite) {
        $pdo->prepare("UPDATE visitor_operator_invites SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()), session_id = :session_id WHERE id = :id")
            ->execute([':session_id' => $sessionId, ':id' => (int) $invite['id']]);
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'server_time' => date('Y-m-d H:i:s'),
        'visitor' => [
            'id' => $visitorId, 'site_id' => $siteId, 'browser_id' => $browserId,
            'name' => $visitor['name'] ?? null, 'email' => $visitor['email'] ?? null, 'phone' => $visitor['phone'] ?? null,
        ],
        'session' => ['id' => $sessionId, 'session_key' => $sessionKey, 'status' => $event === 'close' ? 'closed' : 'active'],
        'invite' => $invite ? [
            'id' => (int) $invite['id'], 'conversation_id' => (int) $invite['conversation_id'],
            'message' => $invite['message_preview'], 'expires_at' => $invite['expires_at'],
            'operator' => ['id' => (int) $invite['operator_id'], 'name' => $invite['operator_name']],
            'department' => $invite['department_id'] ? ['id' => (int) $invite['department_id'], 'name' => $invite['department_name'], 'color' => $invite['department_color']] : null,
        ] : null,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to update visitor presence'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
