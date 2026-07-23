<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/routing.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();
$conversationId = (int) ($input['conversation_id'] ?? 0);
$agentId = array_key_exists('agent_id', $input) && $input['agent_id'] !== null ? (int) $input['agent_id'] : null;
if ($conversationId <= 0) json_response(['success' => false, 'message' => 'conversation_id is required'], 422);

try {
    $conversationStmt = $pdo->prepare("\n        SELECT conversations.id, conversations.site_id, conversations.status, conversations.department_id,\n               conversations.assigned_agent_id, conversations.queue_status, sites.tenant_id AS site_tenant_id\n        FROM conversations\n        INNER JOIN sites ON sites.id = conversations.site_id\n        INNER JOIN tenants ON tenants.id = sites.tenant_id\n        WHERE conversations.id = :conversation_id AND sites.is_active = 1 AND tenants.status = 'active' LIMIT 1\n    ");
    $conversationStmt->execute([':conversation_id' => $conversationId]);
    $conversation = $conversationStmt->fetch();
    if (!$conversation) json_response(['success' => false, 'message' => 'Conversation not found'], 404);
    $siteId = (int) $conversation['site_id'];
    require_site_access($pdo, $user, $siteId);
    if ($conversation['status'] === 'closed') json_response(['success' => false, 'message' => 'Closed conversations cannot be reassigned'], 422);

    $agent = null;
    if ($agentId !== null && $agentId > 0) {
        $agentStmt = $pdo->prepare("\n            SELECT users.id, users.name, users.email, users.role\n            FROM users\n            LEFT JOIN agent_site_access ON agent_site_access.user_id = users.id AND agent_site_access.site_id = :site_id\n            LEFT JOIN department_members ON department_members.user_id = users.id\n              AND department_members.department_id = :department_id AND department_members.is_active = 1\n            WHERE users.id = :agent_id AND users.tenant_id = :tenant_id AND users.is_active = 1\n              AND users.role IN ('customer_admin','agent')\n              AND (users.role = 'customer_admin' OR agent_site_access.site_id IS NOT NULL)\n              AND (users.role = 'customer_admin' OR :department_id_check IS NULL OR department_members.user_id IS NOT NULL)\n            LIMIT 1\n        ");
        $departmentIdParam = $conversation['department_id'] !== null ? (int) $conversation['department_id'] : null;
        $agentStmt->execute([
            ':site_id' => $siteId,
            ':department_id' => $departmentIdParam,
            ':agent_id' => $agentId,
            ':tenant_id' => (int) $user['tenant_id'],
            ':department_id_check' => $departmentIdParam,
        ]);
        $agent = $agentStmt->fetch();
        if (!$agent) json_response(['success' => false, 'message' => 'Selected agent is not a member of this department or site'], 404);
    } else {
        $agentId = null;
    }

    $pdo->beginTransaction();
    $oldAgentId = $conversation['assigned_agent_id'] !== null ? (int) $conversation['assigned_agent_id'] : null;
    $stmt = $pdo->prepare("\n        UPDATE conversations SET\n          assigned_agent_id = :assigned_agent_id,\n          queue_status = CASE WHEN :assigned_agent_id_status IS NULL THEN 'none' ELSE 'assigned' END,\n          queue_position = NULL, queued_at = NULL,\n          assigned_at = CASE WHEN :assigned_agent_id_time IS NULL THEN NULL ELSE NOW() END,\n          assignment_method = CASE WHEN :assigned_agent_id_method IS NULL THEN NULL ELSE 'manual' END,\n          status = CASE WHEN status IN ('new','pending') AND :assigned_agent_id_progress IS NOT NULL THEN 'in_progress' ELSE status END\n        WHERE id = :conversation_id\n    ");
    $stmt->execute([
        ':assigned_agent_id' => $agentId,
        ':assigned_agent_id_status' => $agentId,
        ':assigned_agent_id_time' => $agentId,
        ':assigned_agent_id_method' => $agentId,
        ':assigned_agent_id_progress' => $agentId,
        ':conversation_id' => $conversationId,
    ]);

    routing_log_assignment(
        $pdo,
        $conversationId,
        $conversation['department_id'] !== null ? (int) $conversation['department_id'] : null,
        $oldAgentId,
        $agentId,
        $agentId ? 'manual_assigned' : 'unassigned',
        'manual',
        (int) $user['id']
    );
    if ($conversation['department_id'] !== null) routing_reindex_queue($pdo, (int) $conversation['department_id']);
    $pdo->commit();

    json_response([
        'success' => true,
        'message' => $agentId ? 'Conversation assigned successfully' : 'Conversation unassigned successfully',
        'assigned_agent' => $agent ? ['id' => (int) $agent['id'], 'name' => $agent['name'], 'email' => $agent['email']] : null,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to assign conversation'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
