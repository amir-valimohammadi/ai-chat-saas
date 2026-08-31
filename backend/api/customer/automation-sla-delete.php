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
$policyId = max(0, (int) ($input['policy_id'] ?? 0));
if ($policyId <= 0) json_response(['success' => false, 'message' => 'شناسه سیاست الزامی است.'], 422);

try {
    $pdo->beginTransaction();
    $policyStmt = $pdo->prepare("SELECT id FROM automation_sla_policies WHERE id = :id AND tenant_id = :tenant_id LIMIT 1 FOR UPDATE");
    $policyStmt->execute([':id' => $policyId, ':tenant_id' => (int) $user['tenant_id']]);
    if (!$policyStmt->fetchColumn()) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'سیاست SLA پیدا نشد.'], 404);
    }

    $trackingStmt = $pdo->prepare("SELECT COUNT(*) FROM conversation_sla_status WHERE policy_id = :policy_id");
    $trackingStmt->execute([':policy_id' => $policyId]);
    $hasHistory = (int) $trackingStmt->fetchColumn() > 0;
    if ($hasHistory) {
        $stmt = $pdo->prepare("UPDATE automation_sla_policies SET is_active = 0, is_default = 0, updated_by = :updated_by WHERE id = :id");
        $stmt->execute([':updated_by' => (int) $user['id'], ':id' => $policyId]);
    } else {
        $stmt = $pdo->prepare("DELETE FROM automation_sla_policies WHERE id = :id");
        $stmt->execute([':id' => $policyId]);
    }
    $pdo->commit();
    json_response([
        'success' => true,
        'message' => $hasHistory ? 'سیاست غیرفعال شد تا تاریخچه SLA گفتگوها حفظ شود.' : 'سیاست SLA حذف شد.',
        'deactivated' => $hasHistory,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'حذف سیاست SLA ناموفق بود.'], 500);
}
