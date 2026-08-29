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
$departmentId = (int) ($input['department_id'] ?? 0);
if ($departmentId <= 0) json_response(['success' => false, 'message' => 'department_id is required'], 422);

try {
    $department = routing_department($pdo, $departmentId, (int) $user['tenant_id'], null, false);
    if (!$department) json_response(['success' => false, 'message' => 'Department not found'], 404);
    if ((int) $department['is_default'] === 1) json_response(['success' => false, 'message' => 'Default department cannot be deleted'], 422);

    $activeStmt = $pdo->prepare("SELECT COUNT(*) FROM conversations WHERE department_id = :id AND status <> 'closed' AND is_archived = 0");
    $activeStmt->execute([':id' => $departmentId]);
    if ((int) $activeStmt->fetchColumn() > 0) json_response(['success' => false, 'message' => 'Move or close active conversations before deleting this department'], 409);

    $pdo->prepare("DELETE FROM departments WHERE id = :id AND tenant_id = :tenant_id")
        ->execute([':id' => $departmentId, ':tenant_id' => (int) $user['tenant_id']]);
    json_response(['success' => true, 'message' => 'Department deleted']);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to delete department'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
