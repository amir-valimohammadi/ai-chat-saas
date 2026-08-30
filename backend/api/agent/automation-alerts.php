<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

if (!automation_tables_ready($pdo)) {
    json_response(['success' => true, 'alerts' => [], 'unread_count' => 0]);
}

try {
    $recipientSql = $user['role'] === 'customer_admin'
        ? ' AND (automation_alerts.recipient_user_id IS NULL OR automation_alerts.recipient_user_id = :recipient_user_id) '
        : ' AND automation_alerts.recipient_user_id = :recipient_user_id ';
    $params = [
        ':tenant_id' => (int) $user['tenant_id'],
        ':recipient_user_id' => (int) $user['id'],
    ];

    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM automation_alerts
        WHERE tenant_id = :tenant_id AND is_read = 0 {$recipientSql}
    ");
    $countStmt->execute($params);
    $unreadCount = (int) $countStmt->fetchColumn();

    $alertsStmt = $pdo->prepare("
        SELECT automation_alerts.id, automation_alerts.conversation_id,
               automation_alerts.severity, automation_alerts.title,
               automation_alerts.message, automation_alerts.is_read,
               automation_alerts.created_at, sites.name AS site_name
        FROM automation_alerts
        LEFT JOIN sites ON sites.id = automation_alerts.site_id
        WHERE automation_alerts.tenant_id = :tenant_id {$recipientSql}
        ORDER BY automation_alerts.id DESC
        LIMIT 20
    ");
    $alertsStmt->execute($params);
    $alerts = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        'conversation_id' => $row['conversation_id'] !== null ? (int) $row['conversation_id'] : null,
        'severity' => $row['severity'],
        'title' => $row['title'],
        'message' => $row['message'],
        'is_read' => (bool) $row['is_read'],
        'site_name' => $row['site_name'],
        'created_at' => $row['created_at'],
    ], $alertsStmt->fetchAll());

    json_response(['success' => true, 'alerts' => $alerts, 'unread_count' => $unreadCount]);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'دریافت اعلان‌های اتوماسیون ناموفق بود.'], 500);
}
