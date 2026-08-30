<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$tenantId = (int) $user['tenant_id'];
$ruleId = max(0, (int) ($input['rule_id'] ?? 0));
$isNewRule = $ruleId <= 0;
$name = mb_substr(trim((string) ($input['name'] ?? '')), 0, 190, 'UTF-8');
$description = mb_substr(trim((string) ($input['description'] ?? '')), 0, 2000, 'UTF-8');
$trigger = trim((string) ($input['trigger_type'] ?? ''));
$siteId = max(0, (int) ($input['site_id'] ?? 0));

if ($name === '') json_response(['success' => false, 'message' => 'نام قانون الزامی است.'], 422);
if (!array_key_exists($trigger, automation_trigger_catalog())) json_response(['success' => false, 'message' => 'رویداد قانون معتبر نیست.'], 422);

try {
    if ($siteId > 0) {
        $siteStmt = $pdo->prepare("SELECT id FROM sites WHERE id = :site_id AND tenant_id = :tenant_id LIMIT 1");
        $siteStmt->execute([':site_id' => $siteId, ':tenant_id' => $tenantId]);
        if (!$siteStmt->fetchColumn()) json_response(['success' => false, 'message' => 'سایت انتخاب‌شده معتبر نیست.'], 422);
    }

    $conditions = automation_normalize_conditions($input['conditions'] ?? []);
    $actions = automation_normalize_actions($input['actions'] ?? []);
    $matchType = ($input['match_type'] ?? 'all') === 'any' ? 'any' : 'all';
    $priority = max(1, min(1000, (int) ($input['priority'] ?? 100)));
    $cooldown = max(0, min(2592000, (int) ($input['cooldown_seconds'] ?? 0)));
    $isActive = array_key_exists('is_active', $input) ? (!empty($input['is_active']) ? 1 : 0) : 1;
    $stopProcessing = !empty($input['stop_processing']) ? 1 : 0;

    if ($ruleId > 0) {
        $exists = $pdo->prepare("SELECT id FROM automation_rules WHERE id = :id AND tenant_id = :tenant_id LIMIT 1");
        $exists->execute([':id' => $ruleId, ':tenant_id' => $tenantId]);
        if (!$exists->fetchColumn()) json_response(['success' => false, 'message' => 'قانون پیدا نشد.'], 404);
        $stmt = $pdo->prepare("
            UPDATE automation_rules SET site_id = :site_id, name = :name, description = :description,
                trigger_type = :trigger_type, match_type = :match_type, conditions_json = :conditions_json,
                actions_json = :actions_json, is_active = :is_active, priority = :priority,
                cooldown_seconds = :cooldown_seconds, stop_processing = :stop_processing, updated_by = :updated_by
            WHERE id = :id AND tenant_id = :tenant_id
        ");
        $stmt->execute([
            ':site_id' => $siteId > 0 ? $siteId : null, ':name' => $name, ':description' => $description !== '' ? $description : null,
            ':trigger_type' => $trigger, ':match_type' => $matchType, ':conditions_json' => automation_json($conditions),
            ':actions_json' => automation_json($actions), ':is_active' => $isActive, ':priority' => $priority,
            ':cooldown_seconds' => $cooldown, ':stop_processing' => $stopProcessing, ':updated_by' => (int) $user['id'],
            ':id' => $ruleId, ':tenant_id' => $tenantId,
        ]);
    } else {
        $stmt = $pdo->prepare("
            INSERT INTO automation_rules (
                tenant_id, site_id, name, description, trigger_type, match_type, conditions_json,
                actions_json, is_active, priority, cooldown_seconds, stop_processing, created_by, updated_by
            ) VALUES (
                :tenant_id, :site_id, :name, :description, :trigger_type, :match_type, :conditions_json,
                :actions_json, :is_active, :priority, :cooldown_seconds, :stop_processing, :created_by, :updated_by
            )
        ");
        $stmt->execute([
            ':tenant_id' => $tenantId, ':site_id' => $siteId > 0 ? $siteId : null, ':name' => $name,
            ':description' => $description !== '' ? $description : null, ':trigger_type' => $trigger,
            ':match_type' => $matchType, ':conditions_json' => automation_json($conditions), ':actions_json' => automation_json($actions),
            ':is_active' => $isActive, ':priority' => $priority, ':cooldown_seconds' => $cooldown,
            ':stop_processing' => $stopProcessing, ':created_by' => (int) $user['id'], ':updated_by' => (int) $user['id'],
        ]);
        $ruleId = (int) $pdo->lastInsertId();
    }

    json_response(['success' => true, 'message' => 'قانون اتوماسیون ذخیره شد.', 'rule_id' => $ruleId], $isNewRule ? 201 : 200);
} catch (InvalidArgumentException $e) {
    json_response(['success' => false, 'message' => $e->getMessage()], 422);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'ذخیره قانون ناموفق بود.'], 500);
}
