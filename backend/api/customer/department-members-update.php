<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/routing.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$departmentId = isset($input['department_id']) ? (int) $input['department_id'] : 0;
$members = $input['members'] ?? [];
if ($departmentId <= 0 || !is_array($members)) json_response(['success' => false, 'message' => 'department_id and members are required'], 422);

try {
    $department = routing_department($pdo, $departmentId, (int) $user['tenant_id'], null, false);
    if (!$department) json_response(['success' => false, 'message' => 'Department not found'], 404);

    $normalized = [];
    foreach ($members as $member) {
        $userId = (int) ($member['user_id'] ?? 0);
        if ($userId <= 0) continue;
        $normalized[$userId] = [
            'user_id' => $userId,
            'is_active' => array_key_exists('is_active', $member) ? (!empty($member['is_active']) ? 1 : 0) : 1,
            'max_active_conversations' => max(1, min(100, (int) ($member['max_active_conversations'] ?? 5))),
            'routing_weight' => max(1, min(20, (int) ($member['routing_weight'] ?? 1))),
        ];
    }

    if ($normalized) {
        $ids = array_keys($normalized);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("\n            SELECT DISTINCT users.id\n            FROM users\n            LEFT JOIN agent_site_access ON agent_site_access.user_id = users.id AND agent_site_access.site_id = ?\n            WHERE users.tenant_id = ? AND users.id IN ({$placeholders}) AND users.is_active = 1\n              AND users.role IN ('customer_admin','agent')\n              AND (users.role = 'customer_admin' OR agent_site_access.site_id IS NOT NULL)\n        ");
        $stmt->execute(array_merge([(int) $department['site_id'], (int) $user['tenant_id']], $ids));
        $valid = array_map('intval', array_column($stmt->fetchAll(), 'id'));
        sort($valid); $expected = $ids; sort($expected);
        if ($valid !== $expected) json_response(['success' => false, 'message' => 'One or more team members are invalid for this site'], 422);
    }

    $pdo->beginTransaction();
    $pdo->prepare("DELETE FROM department_members WHERE department_id = :department_id")
        ->execute([':department_id' => $departmentId]);
    $insert = $pdo->prepare("\n        INSERT INTO department_members (department_id, user_id, is_active, max_active_conversations, routing_weight)\n        VALUES (:department_id, :user_id, :is_active, :max_active, :routing_weight)\n    ");
    foreach ($normalized as $member) {
        $insert->execute([
            ':department_id' => $departmentId, ':user_id' => $member['user_id'], ':is_active' => $member['is_active'],
            ':max_active' => $member['max_active_conversations'], ':routing_weight' => $member['routing_weight'],
        ]);
    }
    $pdo->commit();
    json_response(['success' => true, 'message' => 'Department members updated', 'member_count' => count($normalized)]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to update department members'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
