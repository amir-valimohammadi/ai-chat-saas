<?php

// Bulk inbox management with phase 5 department routing support.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/routing.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();
$ids = is_array($input['conversation_ids'] ?? null)
    ? array_values(array_unique(array_filter(array_map('intval', $input['conversation_ids']), static fn($id) => $id > 0)))
    : [];
$action = trim((string) ($input['action'] ?? ''));
$value = $input['value'] ?? null;

if (!$ids || count($ids) > 100) json_response(['success' => false, 'message' => 'Select between 1 and 100 conversations'], 422);
$allowedStatuses = ['new','open','in_progress','waiting_customer','follow_up','pending','closed'];
$allowedPriorities = ['low','normal','high','urgent'];
$allowedActions = ['archive','unarchive','pin','unpin','priority','status','assign','department'];
if (!in_array($action, $allowedActions, true)) json_response(['success' => false, 'message' => 'Invalid bulk action'], 422);
if ($action === 'priority' && !in_array((string) $value, $allowedPriorities, true)) json_response(['success' => false, 'message' => 'Invalid priority'], 422);
if ($action === 'status' && !in_array((string) $value, $allowedStatuses, true)) json_response(['success' => false, 'message' => 'Invalid status'], 422);

try {
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $accessSql = $user['role'] === 'customer_admin'
        ? "SELECT conversations.id, conversations.site_id, conversations.department_id, conversations.assigned_agent_id, conversations.status FROM conversations INNER JOIN sites ON sites.id = conversations.site_id WHERE conversations.id IN ($placeholders) AND sites.tenant_id = ?"
        : "SELECT DISTINCT conversations.id, conversations.site_id, conversations.department_id, conversations.assigned_agent_id, conversations.status FROM conversations INNER JOIN sites ON sites.id = conversations.site_id INNER JOIN agent_site_access ON agent_site_access.site_id = sites.id AND agent_site_access.user_id = ? WHERE conversations.id IN ($placeholders) AND sites.tenant_id = ?";
    $accessParams = $user['role'] === 'customer_admin'
        ? array_merge($ids, [(int) $user['tenant_id']])
        : array_merge([(int) $user['id']], $ids, [(int) $user['tenant_id']]);
    $stmt = $pdo->prepare($accessSql);
    $stmt->execute($accessParams);
    $accessible = $stmt->fetchAll();
    if (count($accessible) !== count($ids)) json_response(['success' => false, 'message' => 'One or more conversations are unavailable'], 403);

    if ($action === 'department') {
        $departmentId = (int) $value;
        if ($departmentId <= 0) json_response(['success' => false, 'message' => 'Select a department'], 422);
        $siteIds = array_values(array_unique(array_map(static fn(array $row): int => (int) $row['site_id'], $accessible)));
        if (count($siteIds) !== 1) json_response(['success' => false, 'message' => 'Bulk department transfer requires conversations from one site'], 422);
        $department = routing_department($pdo, $departmentId, (int) $user['tenant_id'], $siteIds[0], true);
        if (!$department) json_response(['success' => false, 'message' => 'Department not found'], 404);

        $pdo->beginTransaction();
        foreach ($accessible as $conversation) {
            $oldDepartmentId = $conversation['department_id'] !== null ? (int) $conversation['department_id'] : null;
            $oldAgentId = $conversation['assigned_agent_id'] !== null ? (int) $conversation['assigned_agent_id'] : null;
            $pdo->prepare("UPDATE conversations SET department_id = :department_id, assigned_agent_id = NULL, queue_status = 'none', queue_position = NULL, queued_at = NULL, assigned_at = NULL, assignment_method = NULL WHERE id = :id")
                ->execute([':department_id' => $departmentId, ':id' => (int) $conversation['id']]);
            routing_log_assignment($pdo, (int) $conversation['id'], $departmentId, $oldAgentId, null, 'department_transfer', 'manual', (int) $user['id'], $oldDepartmentId ? "from_department:{$oldDepartmentId}" : null);
            if ($oldDepartmentId) routing_reindex_queue($pdo, $oldDepartmentId);
            routing_route_conversation($pdo, (int) $conversation['id'], $department, (int) $user['id']);
        }
        $pdo->commit();
        json_response(['success' => true, 'message' => 'Bulk department transfer completed', 'updated_count' => count($accessible), 'selected_count' => count($ids)]);
    }

    if ($action === 'assign') {
        $agentId = ($value !== null && $value !== '' && (int) $value > 0) ? (int) $value : null;
        if ($agentId !== null) {
            foreach ($accessible as $conversation) {
                $agentStmt = $pdo->prepare("\n                    SELECT users.id\n                    FROM users\n                    LEFT JOIN agent_site_access ON agent_site_access.user_id = users.id AND agent_site_access.site_id = :site_id\n                    LEFT JOIN department_members ON department_members.user_id = users.id AND department_members.department_id = :department_id AND department_members.is_active = 1\n                    WHERE users.id = :agent_id AND users.tenant_id = :tenant_id AND users.is_active = 1\n                      AND users.role IN ('customer_admin','agent')\n                      AND (users.role = 'customer_admin' OR agent_site_access.site_id IS NOT NULL)\n                      AND (users.role = 'customer_admin' OR :department_check IS NULL OR department_members.user_id IS NOT NULL)\n                    LIMIT 1\n                ");
                $departmentId = $conversation['department_id'] !== null ? (int) $conversation['department_id'] : null;
                $agentStmt->execute([
                    ':site_id' => (int) $conversation['site_id'], ':department_id' => $departmentId,
                    ':agent_id' => $agentId, ':tenant_id' => (int) $user['tenant_id'], ':department_check' => $departmentId,
                ]);
                if (!$agentStmt->fetchColumn()) json_response(['success' => false, 'message' => 'Selected agent cannot access all selected departments'], 422);
            }
        }

        $pdo->beginTransaction();
        $update = $pdo->prepare("\n            UPDATE conversations SET assigned_agent_id = :agent_id,\n              queue_status = CASE WHEN :agent_status IS NULL THEN 'none' ELSE 'assigned' END,\n              queue_position = NULL, queued_at = NULL, assigned_at = CASE WHEN :agent_time IS NULL THEN NULL ELSE NOW() END,\n              assignment_method = CASE WHEN :agent_method IS NULL THEN NULL ELSE 'manual' END,\n              status = CASE WHEN status IN ('new','pending') AND :agent_progress IS NOT NULL THEN 'in_progress' ELSE status END\n            WHERE id = :id\n        ");
        foreach ($accessible as $conversation) {
            $oldAgentId = $conversation['assigned_agent_id'] !== null ? (int) $conversation['assigned_agent_id'] : null;
            $update->execute([':agent_id' => $agentId, ':agent_status' => $agentId, ':agent_time' => $agentId, ':agent_method' => $agentId, ':agent_progress' => $agentId, ':id' => (int) $conversation['id']]);
            routing_log_assignment($pdo, (int) $conversation['id'], $conversation['department_id'] !== null ? (int) $conversation['department_id'] : null, $oldAgentId, $agentId, $agentId ? 'manual_assigned' : 'unassigned', 'manual', (int) $user['id']);
            if ($conversation['department_id'] !== null) routing_reindex_queue($pdo, (int) $conversation['department_id']);
        }
        $pdo->commit();
        json_response(['success' => true, 'message' => 'Bulk assignment completed', 'updated_count' => count($accessible), 'selected_count' => count($ids)]);
    }

    $updateParams = [];
    switch ($action) {
        case 'archive': $setSql = 'is_archived = 1, archived_at = NOW(), is_pinned = 0, pinned_at = NULL'; break;
        case 'unarchive': $setSql = 'is_archived = 0, archived_at = NULL'; break;
        case 'pin': $setSql = 'is_pinned = 1, pinned_at = NOW(), is_archived = 0, archived_at = NULL'; break;
        case 'unpin': $setSql = 'is_pinned = 0, pinned_at = NULL'; break;
        case 'priority': $setSql = 'priority = ?'; $updateParams[] = (string) $value; break;
        case 'status':
            $setSql = "status = ?, closed_at = CASE WHEN ? = 'closed' THEN NOW() ELSE NULL END, queue_status = CASE WHEN ? = 'closed' THEN 'none' ELSE queue_status END, queue_position = CASE WHEN ? = 'closed' THEN NULL ELSE queue_position END";
            $updateParams = [(string) $value, (string) $value, (string) $value, (string) $value];
            break;
        default: json_response(['success' => false, 'message' => 'Unsupported action'], 422);
    }
    $updateStmt = $pdo->prepare("UPDATE conversations SET {$setSql} WHERE id IN ({$placeholders})");
    $updateStmt->execute(array_merge($updateParams, $ids));
    foreach ($accessible as $row) if ($row['department_id'] !== null) routing_reindex_queue($pdo, (int) $row['department_id']);
    if ($action === 'status') {
        foreach ($accessible as $row) {
            automation_dispatch_event_safe(
                $pdo,
                'status_changed',
                (int) $row['id'],
                ['previous_status' => $row['status'], 'new_status' => (string) $value],
                (int) $user['id']
            );
        }
    }

    json_response(['success' => true, 'message' => 'Bulk action completed', 'updated_count' => $updateStmt->rowCount(), 'selected_count' => count($ids)]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Bulk action failed'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
