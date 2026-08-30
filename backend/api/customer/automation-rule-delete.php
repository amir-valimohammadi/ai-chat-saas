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
    $stmt = $pdo->prepare("DELETE FROM automation_rules WHERE id = :id AND tenant_id = :tenant_id");
    $stmt->execute([':id' => $ruleId, ':tenant_id' => (int) $user['tenant_id']]);
    if ($stmt->rowCount() === 0) json_response(['success' => false, 'message' => 'قانون پیدا نشد.'], 404);
    json_response(['success' => true, 'message' => 'قانون حذف شد؛ تاریخچه اجرا حفظ شده است.']);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'حذف قانون ناموفق بود.'], 500);
}

