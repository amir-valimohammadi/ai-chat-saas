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
$departmentId = (int) ($input['department_id'] ?? 0);
if ($conversationId <= 0 || $departmentId <= 0) json_response(['success' => false, 'message' => 'conversation_id and department_id are required'], 422);

try {
    $stmt = $pdo->prepare("\n        SELECT conversations.id, conversations.site_id, conversations.department_id, conversations.assigned_agent_id, conversations.status\n        FROM conversations INNER JOIN sites ON sites.id = conversations.site_id\n        WHERE conversations.id = :id AND sites.tenant_id = :tenant_id LIMIT 1\n    ");
    $stmt->execute([':id' => $conversationId, ':tenant_id' => (int) $user['tenant_id']]);
    $conversation = $stmt->fetch();
    if (!$conversation) json_response(['success' => false, 'message' => 'Conversation not found'], 404);
    require_site_access($pdo, $user, (int) $conversation['site_id']);
    if ($conversation['status'] === 'closed') json_response(['success' => false, 'message' => 'Closed conversations cannot be transferred'], 422);

    $department = routing_department($pdo, $departmentId, (int) $user['tenant_id'], (int) $conversation['site_id'], true);
    if (!$department) json_response(['success' => false, 'message' => 'Department not found'], 404);

    $pdo->beginTransaction();
    $oldDepartmentId = $conversation['department_id'] !== null ? (int) $conversation['department_id'] : null;
    $oldAgentId = $conversation['assigned_agent_id'] !== null ? (int) $conversation['assigned_agent_id'] : null;
    $pdo->prepare("\n        UPDATE conversations SET department_id = :department_id, assigned_agent_id = NULL, queue_status = 'none',\n            queue_position = NULL, queued_at = NULL, assigned_at = NULL, assignment_method = NULL\n        WHERE id = :conversation_id\n    ")->execute([':department_id' => $departmentId, ':conversation_id' => $conversationId]);
    routing_log_assignment($pdo, $conversationId, $departmentId, $oldAgentId, null, 'department_transfer', 'manual', (int) $user['id'], $oldDepartmentId ? "from_department:{$oldDepartmentId}" : null);
    if ($oldDepartmentId) routing_reindex_queue($pdo, $oldDepartmentId);
    $result = routing_route_conversation($pdo, $conversationId, $department, (int) $user['id']);
    $pdo->commit();

    json_response(['success' => true, 'message' => 'Conversation transferred', 'routing' => $result]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to transfer conversation'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
