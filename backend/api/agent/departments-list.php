<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;
$conversationId = isset($_GET['conversation_id']) ? (int) $_GET['conversation_id'] : 0;

try {
    if ($conversationId > 0) {
        $stmt = $pdo->prepare("SELECT site_id FROM conversations WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $conversationId]);
        $siteId = (int) $stmt->fetchColumn();
    }
    if ($siteId <= 0) json_response(['success' => false, 'message' => 'site_id or conversation_id is required'], 422);
    require_site_access($pdo, $user, $siteId);

    $stmt = $pdo->prepare("\n        SELECT departments.id, departments.name, departments.description, departments.color,\n               departments.routing_strategy, departments.queue_enabled, departments.is_default,\n               COUNT(DISTINCT CASE WHEN department_members.is_active = 1 THEN department_members.user_id END) AS member_count,\n               COUNT(DISTINCT CASE WHEN conversations.queue_status = 'waiting' AND conversations.status <> 'closed' THEN conversations.id END) AS waiting_count\n        FROM departments\n        LEFT JOIN department_members ON department_members.department_id = departments.id\n        LEFT JOIN conversations ON conversations.department_id = departments.id\n        WHERE departments.site_id = :site_id AND departments.tenant_id = :tenant_id AND departments.is_active = 1\n        GROUP BY departments.id, departments.name, departments.description, departments.color,\n                 departments.routing_strategy, departments.queue_enabled, departments.is_default\n        ORDER BY departments.is_default DESC, departments.name ASC\n    ");
    $stmt->execute([':site_id' => $siteId, ':tenant_id' => (int) $user['tenant_id']]);
    json_response(['success' => true, 'departments' => array_map(static fn(array $row): array => [
        'id' => (int) $row['id'], 'name' => $row['name'], 'description' => $row['description'], 'color' => $row['color'],
        'routing_strategy' => $row['routing_strategy'], 'queue_enabled' => (bool) $row['queue_enabled'],
        'is_default' => (bool) $row['is_default'], 'member_count' => (int) $row['member_count'], 'waiting_count' => (int) $row['waiting_count'],
    ], $stmt->fetchAll())]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load departments'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
