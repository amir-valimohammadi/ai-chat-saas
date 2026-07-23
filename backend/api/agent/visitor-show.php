<?php

// Messaging phase 6: detailed visitor profile and browsing journey.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/visitor-presence.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin','agent']);
$visitorId = (int) ($_GET['visitor_id'] ?? 0);
if ($visitorId <= 0) json_response(['success' => false, 'message' => 'visitor_id is required'], 422);

try {
    $stmt = $pdo->prepare("\n        SELECT visitors.*, sites.name AS site_name, sites.tenant_id\n        FROM visitors INNER JOIN sites ON sites.id = visitors.site_id\n        WHERE visitors.id = :visitor_id AND sites.tenant_id = :tenant_id LIMIT 1\n    ");
    $stmt->execute([':visitor_id' => $visitorId, ':tenant_id' => (int) $user['tenant_id']]);
    $visitor = $stmt->fetch();
    if (!$visitor) json_response(['success' => false, 'message' => 'Visitor not found'], 404);
    require_site_access($pdo, $user, (int) $visitor['site_id']);

    $sessionStmt = $pdo->prepare("SELECT * FROM visitor_sessions WHERE visitor_id = :visitor_id ORDER BY last_seen_at DESC, id DESC LIMIT 10");
    $sessionStmt->execute([':visitor_id' => $visitorId]);
    $sessions = $sessionStmt->fetchAll();

    $pageStmt = $pdo->prepare("SELECT id, session_id, page_url, page_title, referrer_url, entered_at, last_seen_at, duration_seconds, is_current FROM visitor_page_views WHERE visitor_id = :visitor_id ORDER BY entered_at DESC, id DESC LIMIT 100");
    $pageStmt->execute([':visitor_id' => $visitorId]);

    $conversationStmt = $pdo->prepare("\n        SELECT c.id, c.status, c.created_at, c.last_message_at, d.name AS department_name, u.name AS assigned_agent_name\n        FROM conversations c LEFT JOIN departments d ON d.id = c.department_id LEFT JOIN users u ON u.id = c.assigned_agent_id\n        WHERE c.visitor_id = :visitor_id ORDER BY c.id DESC LIMIT 20\n    ");
    $conversationStmt->execute([':visitor_id' => $visitorId]);

    $departmentStmt = $pdo->prepare("\n        SELECT d.id, d.name, d.color, d.is_default\n        FROM departments d\n        WHERE d.site_id = :site_id AND d.tenant_id = :tenant_id AND d.is_active = 1\n          AND (:is_agent = 0 OR EXISTS (SELECT 1 FROM department_members dm WHERE dm.department_id = d.id AND dm.user_id = :user_id AND dm.is_active = 1))\n        ORDER BY d.is_default DESC, d.name ASC\n    ");
    $departmentStmt->execute([':site_id' => (int) $visitor['site_id'], ':tenant_id' => (int) $user['tenant_id'], ':is_agent' => $user['role'] === 'agent' ? 1 : 0, ':user_id' => (int) $user['id']]);

    $inviteStmt = $pdo->prepare("SELECT id, conversation_id, message_preview, status, delivered_at, responded_at, expires_at, created_at FROM visitor_operator_invites WHERE visitor_id = :visitor_id ORDER BY id DESC LIMIT 10");
    $inviteStmt->execute([':visitor_id' => $visitorId]);

    json_response([
        'success' => true,
        'visitor' => [
            'id' => (int) $visitor['id'], 'site' => ['id' => (int) $visitor['site_id'], 'name' => $visitor['site_name']],
            'name' => $visitor['name'], 'email' => $visitor['email'], 'phone' => $visitor['phone'], 'browser_id' => $visitor['browser_id'],
            'first_seen_at' => $visitor['first_seen_at'], 'last_seen_at' => $visitor['last_seen_at'], 'presence_status' => visitor_presence_status($visitor['last_seen_at']),
            'current_page_url' => $visitor['current_page_url'], 'current_page_title' => $visitor['current_page_title'], 'referrer_url' => $visitor['referrer_url'],
            'device_type' => $visitor['device_type'], 'browser_name' => $visitor['browser_name'], 'operating_system' => $visitor['operating_system'],
            'session_count' => (int) $visitor['session_count'],
        ],
        'sessions' => array_map(static fn(array $row): array => [
            'id' => (int) $row['id'], 'started_at' => $row['started_at'], 'last_seen_at' => $row['last_seen_at'], 'ended_at' => $row['ended_at'],
            'page_view_count' => (int) $row['page_view_count'], 'total_active_seconds' => (int) $row['total_active_seconds'],
            'widget_open' => (bool) $row['widget_open'], 'is_active' => (bool) $row['is_active'], 'first_page_url' => $row['first_page_url'], 'last_page_url' => $row['last_page_url'],
        ], $sessions),
        'page_views' => array_map(static fn(array $row): array => [
            'id' => (int) $row['id'], 'session_id' => (int) $row['session_id'], 'page_url' => $row['page_url'], 'page_title' => $row['page_title'],
            'referrer_url' => $row['referrer_url'], 'entered_at' => $row['entered_at'], 'last_seen_at' => $row['last_seen_at'],
            'duration_seconds' => (int) $row['duration_seconds'], 'is_current' => (bool) $row['is_current'],
        ], $pageStmt->fetchAll()),
        'conversations' => array_map(static fn(array $row): array => [
            'id' => (int) $row['id'], 'status' => $row['status'], 'created_at' => $row['created_at'], 'last_message_at' => $row['last_message_at'],
            'department_name' => $row['department_name'], 'assigned_agent_name' => $row['assigned_agent_name'],
        ], $conversationStmt->fetchAll()),
        'departments' => array_map(static fn(array $row): array => ['id' => (int) $row['id'], 'name' => $row['name'], 'color' => $row['color'], 'is_default' => (bool) $row['is_default']], $departmentStmt->fetchAll()),
        'invites' => $inviteStmt->fetchAll(),
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load visitor details'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
