<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$ruleId = max(0, (int) ($input['rule_id'] ?? 0));
if ($ruleId <= 0) json_response(['success' => false, 'message' => 'شناسه قانون الزامی است.'], 422);

try {
    $exists = $pdo->prepare("SELECT id FROM automation_rules WHERE id = :id AND tenant_id = :tenant_id LIMIT 1");
    $exists->execute([':id' => $ruleId, ':tenant_id' => (int) $user['tenant_id']]);
    if (!$exists->fetchColumn()) json_response(['success' => false, 'message' => 'قانون پیدا نشد.'], 404);

    $stmt = $pdo->prepare("UPDATE automation_rules SET is_active = :is_active, updated_by = :updated_by WHERE id = :id AND tenant_id = :tenant_id");
    $stmt->execute([
        ':is_active' => !empty($input['is_active']) ? 1 : 0,
        ':updated_by' => (int) $user['id'], ':id' => $ruleId, ':tenant_id' => (int) $user['tenant_id'],
    ]);
    json_response(['success' => true, 'message' => 'وضعیت قانون به‌روزرسانی شد.']);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'به‌روزرسانی قانون ناموفق بود.'], 500);
}
