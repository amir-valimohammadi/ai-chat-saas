<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/routing.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);
$input = get_json_input();
$departmentId = (int) ($input['department_id'] ?? 0);
$limit = max(1, min(50, (int) ($input['limit'] ?? 10)));

try {
    if ($departmentId > 0) {
        $department = routing_department($pdo, $departmentId, (int) $user['tenant_id'], null, true);
        if (!$department) json_response(['success' => false, 'message' => 'Department not found'], 404);
        if ($user['role'] === 'agent') {
            $memberStmt = $pdo->prepare("SELECT 1 FROM department_members WHERE department_id = :department_id AND user_id = :user_id AND is_active = 1 LIMIT 1");
            $memberStmt->execute([':department_id' => $departmentId, ':user_id' => (int) $user['id']]);
            if (!$memberStmt->fetchColumn()) json_response(['success' => false, 'message' => 'Department access denied'], 403);
        }
        $result = routing_process_department_queue($pdo, $department, $limit, (int) $user['id']);
    } else {
        $result = routing_process_queues_for_user($pdo, (int) $user['id'], (int) $user['tenant_id'], $limit);
    }
    json_response(['success' => true, 'message' => 'Queue processed', 'result' => $result]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to process queue'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
