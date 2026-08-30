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
$tenantId = (int) $user['tenant_id'];
$policyId = max(0, (int) ($input['policy_id'] ?? 0));
$siteId = max(0, (int) ($input['site_id'] ?? 0));
$departmentId = max(0, (int) ($input['breach_department_id'] ?? 0));
$name = mb_substr(trim((string) ($input['name'] ?? '')), 0, 190, 'UTF-8');
$firstResponseMinutes = max(1, min(43200, (int) ($input['first_response_minutes'] ?? 15)));
$resolutionMinutes = max($firstResponseMinutes, min(525600, (int) ($input['resolution_minutes'] ?? 1440)));
$warningMinutes = max(0, min($firstResponseMinutes - 1, (int) ($input['warning_before_minutes'] ?? 5)));
$breachPriority = trim((string) ($input['breach_priority'] ?? 'urgent'));
$isDefault = !empty($input['is_default']) ? 1 : 0;
$isActive = array_key_exists('is_active', $input) ? (!empty($input['is_active']) ? 1 : 0) : 1;

if ($name === '') json_response(['success' => false, 'message' => 'نام سیاست SLA الزامی است.'], 422);
if (!in_array($breachPriority, ['low', 'normal', 'high', 'urgent'], true)) json_response(['success' => false, 'message' => 'اولویت نقض معتبر نیست.'], 422);

try {
    if ($siteId > 0) {
        $siteStmt = $pdo->prepare("SELECT id FROM sites WHERE id = :site_id AND tenant_id = :tenant_id LIMIT 1");
        $siteStmt->execute([':site_id' => $siteId, ':tenant_id' => $tenantId]);
        if (!$siteStmt->fetchColumn()) json_response(['success' => false, 'message' => 'سایت انتخاب‌شده معتبر نیست.'], 422);
    }
    if ($departmentId > 0) {
        $departmentStmt = $pdo->prepare("SELECT site_id FROM departments WHERE id = :id AND tenant_id = :tenant_id AND is_active = 1 LIMIT 1");
        $departmentStmt->execute([':id' => $departmentId, ':tenant_id' => $tenantId]);
        $departmentSiteId = (int) ($departmentStmt->fetchColumn() ?: 0);
        if ($departmentSiteId <= 0 || ($siteId > 0 && $departmentSiteId !== $siteId)) {
            json_response(['success' => false, 'message' => 'دپارتمان تشدید با سایت سیاست سازگار نیست.'], 422);
        }
    }

    $pdo->beginTransaction();
    if ($policyId > 0) {
        $exists = $pdo->prepare("SELECT id FROM automation_sla_policies WHERE id = :id AND tenant_id = :tenant_id LIMIT 1");
        $exists->execute([':id' => $policyId, ':tenant_id' => $tenantId]);
        if (!$exists->fetchColumn()) {
            $pdo->rollBack();
            json_response(['success' => false, 'message' => 'سیاست SLA پیدا نشد.'], 404);
        }
        $stmt = $pdo->prepare("
            UPDATE automation_sla_policies SET site_id = :site_id, name = :name,
                first_response_minutes = :first_response_minutes, resolution_minutes = :resolution_minutes,
                warning_before_minutes = :warning_before_minutes, breach_priority = :breach_priority,
                breach_department_id = :breach_department_id, is_default = :is_default,
                is_active = :is_active, updated_by = :updated_by
            WHERE id = :id AND tenant_id = :tenant_id
        ");
        $stmt->execute([
            ':site_id' => $siteId > 0 ? $siteId : null, ':name' => $name,
            ':first_response_minutes' => $firstResponseMinutes, ':resolution_minutes' => $resolutionMinutes,
            ':warning_before_minutes' => $warningMinutes, ':breach_priority' => $breachPriority,
            ':breach_department_id' => $departmentId > 0 ? $departmentId : null,
            ':is_default' => $isDefault, ':is_active' => $isActive, ':updated_by' => (int) $user['id'],
            ':id' => $policyId, ':tenant_id' => $tenantId,
        ]);
    } else {
        $stmt = $pdo->prepare("
            INSERT INTO automation_sla_policies (
                tenant_id, site_id, name, first_response_minutes, resolution_minutes,
                warning_before_minutes, breach_priority, breach_department_id,
                is_default, is_active, created_by, updated_by
            ) VALUES (
                :tenant_id, :site_id, :name, :first_response_minutes, :resolution_minutes,
                :warning_before_minutes, :breach_priority, :breach_department_id,
                :is_default, :is_active, :created_by, :updated_by
            )
        ");
        $stmt->execute([
            ':tenant_id' => $tenantId, ':site_id' => $siteId > 0 ? $siteId : null, ':name' => $name,
            ':first_response_minutes' => $firstResponseMinutes, ':resolution_minutes' => $resolutionMinutes,
            ':warning_before_minutes' => $warningMinutes, ':breach_priority' => $breachPriority,
            ':breach_department_id' => $departmentId > 0 ? $departmentId : null,
            ':is_default' => $isDefault, ':is_active' => $isActive,
            ':created_by' => (int) $user['id'], ':updated_by' => (int) $user['id'],
        ]);
        $policyId = (int) $pdo->lastInsertId();
    }

    if ($isDefault && $isActive) {
        if ($siteId > 0) {
            $defaultStmt = $pdo->prepare("UPDATE automation_sla_policies SET is_default = CASE WHEN id = :selected_id THEN 1 ELSE 0 END WHERE tenant_id = :tenant_id AND site_id = :site_id");
            $defaultStmt->execute([':selected_id' => $policyId, ':tenant_id' => $tenantId, ':site_id' => $siteId]);
        } else {
            $defaultStmt = $pdo->prepare("UPDATE automation_sla_policies SET is_default = CASE WHEN id = :selected_id THEN 1 ELSE 0 END WHERE tenant_id = :tenant_id AND site_id IS NULL");
            $defaultStmt->execute([':selected_id' => $policyId, ':tenant_id' => $tenantId]);
        }
    }

    $pdo->commit();
    json_response(['success' => true, 'message' => 'سیاست SLA ذخیره شد.', 'policy_id' => $policyId]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'ذخیره سیاست SLA ناموفق بود.'], 500);
}

