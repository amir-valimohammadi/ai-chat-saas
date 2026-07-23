<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$tenantId = (int) $user['tenant_id'];
$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;

try {
    $params = [':tenant_id' => $tenantId];
    $siteFilter = '';
    if ($siteId > 0) {
        $siteFilter = ' AND departments.site_id = :site_id ';
        $params[':site_id'] = $siteId;
    }

    $stmt = $pdo->prepare("\n        SELECT departments.*, sites.name AS site_name, sites.domain AS site_domain,\n            COUNT(DISTINCT CASE WHEN department_members.is_active = 1 THEN department_members.user_id END) AS member_count,\n            COUNT(DISTINCT CASE WHEN conversations.queue_status = 'waiting' AND conversations.status <> 'closed' THEN conversations.id END) AS waiting_count,\n            COUNT(DISTINCT CASE WHEN conversations.assigned_agent_id IS NOT NULL AND conversations.status IN ('new','open','in_progress','waiting_customer','follow_up','pending') AND conversations.is_archived = 0 THEN conversations.id END) AS active_count\n        FROM departments\n        INNER JOIN sites ON sites.id = departments.site_id AND sites.tenant_id = departments.tenant_id\n        LEFT JOIN department_members ON department_members.department_id = departments.id\n        LEFT JOIN conversations ON conversations.department_id = departments.id\n        WHERE departments.tenant_id = :tenant_id {$siteFilter}\n        GROUP BY departments.id, departments.tenant_id, departments.site_id, departments.name, departments.slug,\n                 departments.description, departments.color, departments.routing_strategy, departments.queue_enabled,\n                 departments.queue_message, departments.is_default, departments.is_active, departments.created_by,\n                 departments.created_at, departments.updated_at, sites.name, sites.domain\n        ORDER BY sites.name ASC, departments.is_default DESC, departments.name ASC\n    ");
    $stmt->execute($params);
    $departments = $stmt->fetchAll();

    $departmentIds = array_map(static fn(array $row): int => (int) $row['id'], $departments);
    $membersByDepartment = [];
    if ($departmentIds) {
        $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));
        $membersStmt = $pdo->prepare("\n            SELECT department_members.department_id, department_members.user_id, department_members.is_active,\n                   department_members.max_active_conversations, department_members.routing_weight, department_members.last_assigned_at,\n                   users.name, users.email, users.availability_status, users.last_seen_at,\n                   COUNT(DISTINCT active_conversations.id) AS active_conversation_count\n            FROM department_members\n            INNER JOIN users ON users.id = department_members.user_id\n            LEFT JOIN conversations AS active_conversations\n              ON active_conversations.assigned_agent_id = users.id\n             AND active_conversations.department_id = department_members.department_id\n             AND active_conversations.status IN ('new','open','in_progress','waiting_customer','follow_up','pending')\n             AND active_conversations.is_archived = 0\n            WHERE department_members.department_id IN ({$placeholders})\n            GROUP BY department_members.department_id, department_members.user_id, department_members.is_active,\n                     department_members.max_active_conversations, department_members.routing_weight,\n                     department_members.last_assigned_at, users.name, users.email, users.availability_status, users.last_seen_at\n            ORDER BY users.name ASC\n        ");
        $membersStmt->execute($departmentIds);
        foreach ($membersStmt->fetchAll() as $member) {
            $id = (int) $member['department_id'];
            $membersByDepartment[$id] ??= [];
            $online = !empty($member['last_seen_at'])
                && ($member['availability_status'] ?? 'online') === 'online'
                && strtotime($member['last_seen_at']) >= strtotime('-2 minutes');
            $membersByDepartment[$id][] = [
                'user_id' => (int) $member['user_id'],
                'name' => $member['name'],
                'email' => $member['email'],
                'is_active' => (bool) $member['is_active'],
                'max_active_conversations' => (int) $member['max_active_conversations'],
                'routing_weight' => (int) $member['routing_weight'],
                'last_assigned_at' => $member['last_assigned_at'],
                'active_conversation_count' => (int) $member['active_conversation_count'],
                'is_online' => $online,
            ];
        }
    }

    json_response([
        'success' => true,
        'departments' => array_map(static function (array $row) use ($membersByDepartment): array {
            $id = (int) $row['id'];
            return [
                'id' => $id,
                'site_id' => (int) $row['site_id'],
                'site_name' => $row['site_name'],
                'site_domain' => $row['site_domain'],
                'name' => $row['name'],
                'slug' => $row['slug'],
                'description' => $row['description'],
                'color' => $row['color'],
                'routing_strategy' => $row['routing_strategy'],
                'queue_enabled' => (bool) $row['queue_enabled'],
                'queue_message' => $row['queue_message'],
                'is_default' => (bool) $row['is_default'],
                'is_active' => (bool) $row['is_active'],
                'member_count' => (int) $row['member_count'],
                'waiting_count' => (int) $row['waiting_count'],
                'active_count' => (int) $row['active_count'],
                'members' => $membersByDepartment[$id] ?? [],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];
        }, $departments),
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load departments'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
