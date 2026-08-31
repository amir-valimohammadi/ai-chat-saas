<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$tenantId = (int) $user['tenant_id'];
$siteId = max(0, (int) ($_GET['site_id'] ?? 0));

if (!automation_tables_ready($pdo)) {
    json_response(['success' => false, 'message' => 'جداول مرکز اتوماسیون هنوز نصب نشده‌اند.'], 503);
}

try {
    $scopeParams = [':tenant_id' => $tenantId];
    $ruleScope = '';
    if ($siteId > 0) {
        $ruleScope = ' AND (automation_rules.site_id IS NULL OR automation_rules.site_id = :site_id) ';
        $scopeParams[':site_id'] = $siteId;
    }

    $rulesStmt = $pdo->prepare("
        SELECT automation_rules.*, sites.name AS site_name
        FROM automation_rules
        LEFT JOIN sites ON sites.id = automation_rules.site_id
        WHERE automation_rules.tenant_id = :tenant_id {$ruleScope}
        ORDER BY automation_rules.is_active DESC, automation_rules.priority ASC, automation_rules.id DESC
    ");
    $rulesStmt->execute($scopeParams);
    $rules = array_map(static function (array $row): array {
        $row['id'] = (int) $row['id'];
        $row['site_id'] = $row['site_id'] !== null ? (int) $row['site_id'] : null;
        $row['is_active'] = (bool) $row['is_active'];
        $row['stop_processing'] = (bool) $row['stop_processing'];
        $row['priority'] = (int) $row['priority'];
        $row['cooldown_seconds'] = (int) $row['cooldown_seconds'];
        $row['run_count'] = (int) $row['run_count'];
        $row['success_count'] = (int) $row['success_count'];
        $row['failure_count'] = (int) $row['failure_count'];
        $row['conditions'] = automation_decode_list($row['conditions_json']);
        $row['actions'] = automation_decode_list($row['actions_json']);
        unset($row['conditions_json'], $row['actions_json']);
        return $row;
    }, $rulesStmt->fetchAll());

    $slaParams = [':tenant_id' => $tenantId];
    $slaScope = '';
    if ($siteId > 0) {
        $slaScope = ' AND (automation_sla_policies.site_id IS NULL OR automation_sla_policies.site_id = :sla_site_id) ';
        $slaParams[':sla_site_id'] = $siteId;
    }
    $slaStmt = $pdo->prepare("
        SELECT automation_sla_policies.*, sites.name AS site_name, departments.name AS breach_department_name,
               COUNT(DISTINCT CASE WHEN conversation_sla_status.state <> 'resolved' THEN conversation_sla_status.conversation_id END) AS tracked_count,
               COUNT(DISTINCT CASE WHEN conversation_sla_status.state = 'warning' THEN conversation_sla_status.conversation_id END) AS warning_count,
               COUNT(DISTINCT CASE WHEN conversation_sla_status.state = 'breached' THEN conversation_sla_status.conversation_id END) AS breached_count
        FROM automation_sla_policies
        LEFT JOIN sites ON sites.id = automation_sla_policies.site_id
        LEFT JOIN departments ON departments.id = automation_sla_policies.breach_department_id
        LEFT JOIN conversation_sla_status ON conversation_sla_status.policy_id = automation_sla_policies.id
        WHERE automation_sla_policies.tenant_id = :tenant_id {$slaScope}
        GROUP BY automation_sla_policies.id
        ORDER BY automation_sla_policies.is_active DESC, automation_sla_policies.is_default DESC, automation_sla_policies.id DESC
    ");
    $slaStmt->execute($slaParams);
    $policies = array_map(static function (array $row): array {
        foreach (['id', 'first_response_minutes', 'resolution_minutes', 'warning_before_minutes', 'tracked_count', 'warning_count', 'breached_count'] as $key) {
            $row[$key] = (int) $row[$key];
        }
        $row['site_id'] = $row['site_id'] !== null ? (int) $row['site_id'] : null;
        $row['breach_department_id'] = $row['breach_department_id'] !== null ? (int) $row['breach_department_id'] : null;
        $row['is_default'] = (bool) $row['is_default'];
        $row['is_active'] = (bool) $row['is_active'];
        $row['use_business_hours'] = (bool) $row['use_business_hours'];
        $row['pause_statuses'] = automation_decode_list($row['pause_statuses_json'] ?? null);
        unset($row['pause_statuses_json']);
        return $row;
    }, $slaStmt->fetchAll());

    $logParams = [':tenant_id' => $tenantId];
    $logScope = '';
    if ($siteId > 0) {
        $logScope = ' AND automation_execution_logs.site_id = :log_site_id ';
        $logParams[':log_site_id'] = $siteId;
    }
    $logStmt = $pdo->prepare("
        SELECT automation_execution_logs.id, automation_execution_logs.rule_id, automation_execution_logs.site_id,
               automation_execution_logs.conversation_id, automation_execution_logs.rule_name,
               automation_execution_logs.trigger_type, automation_execution_logs.status,
               automation_execution_logs.duration_ms, automation_execution_logs.error_message,
               automation_execution_logs.action_results_json, automation_execution_logs.created_at,
               sites.name AS site_name
        FROM automation_execution_logs
        LEFT JOIN sites ON sites.id = automation_execution_logs.site_id
        WHERE automation_execution_logs.tenant_id = :tenant_id {$logScope}
        ORDER BY automation_execution_logs.id DESC
        LIMIT 80
    ");
    $logStmt->execute($logParams);
    $logs = array_map(static function (array $row): array {
        $row['id'] = (int) $row['id'];
        $row['rule_id'] = $row['rule_id'] !== null ? (int) $row['rule_id'] : null;
        $row['site_id'] = $row['site_id'] !== null ? (int) $row['site_id'] : null;
        $row['conversation_id'] = $row['conversation_id'] !== null ? (int) $row['conversation_id'] : null;
        $row['duration_ms'] = (int) $row['duration_ms'];
        $row['action_results'] = automation_decode_list($row['action_results_json']);
        unset($row['action_results_json']);
        return $row;
    }, $logStmt->fetchAll());

    $alertParams = [':tenant_id' => $tenantId, ':recipient_user_id' => (int) $user['id']];
    $alertScope = '';
    if ($siteId > 0) {
        $alertScope = ' AND automation_alerts.site_id = :alert_site_id ';
        $alertParams[':alert_site_id'] = $siteId;
    }
    $alertStmt = $pdo->prepare("
        SELECT automation_alerts.*, sites.name AS site_name
        FROM automation_alerts
        LEFT JOIN sites ON sites.id = automation_alerts.site_id
        WHERE automation_alerts.tenant_id = :tenant_id
          AND (automation_alerts.recipient_user_id IS NULL OR automation_alerts.recipient_user_id = :recipient_user_id)
          {$alertScope}
        ORDER BY automation_alerts.is_read ASC, automation_alerts.id DESC
        LIMIT 30
    ");
    $alertStmt->execute($alertParams);
    $alerts = array_map(static function (array $row): array {
        foreach (['id', 'tenant_id'] as $key) $row[$key] = (int) $row[$key];
        foreach (['site_id', 'rule_id', 'conversation_id', 'recipient_user_id'] as $key) {
            $row[$key] = $row[$key] !== null ? (int) $row[$key] : null;
        }
        $row['is_read'] = (bool) $row['is_read'];
        return $row;
    }, $alertStmt->fetchAll());

    $openAlertParams = [':tenant_id' => $tenantId, ':recipient_user_id' => (int) $user['id']];
    $openAlertScope = '';
    if ($siteId > 0) {
        $openAlertScope = ' AND site_id = :open_alert_site_id ';
        $openAlertParams[':open_alert_site_id'] = $siteId;
    }
    $openAlertStmt = $pdo->prepare("
        SELECT COUNT(*) FROM automation_alerts
        WHERE tenant_id = :tenant_id AND is_read = 0
          AND (recipient_user_id IS NULL OR recipient_user_id = :recipient_user_id)
          {$openAlertScope}
    ");
    $openAlertStmt->execute($openAlertParams);
    $openAlertCount = (int) $openAlertStmt->fetchColumn();

    $statsParams = [':tenant_id' => $tenantId];
    $statsSite = '';
    if ($siteId > 0) {
        $statsSite = ' AND site_id = :stats_site_id ';
        $statsParams[':stats_site_id'] = $siteId;
    }
    $statsStmt = $pdo->prepare("
        SELECT
          COUNT(*) AS executions_7d,
          SUM(status = 'success') AS successes_7d,
          SUM(status = 'failed') AS failures_7d,
          COALESCE(AVG(duration_ms), 0) AS average_duration_ms
        FROM automation_execution_logs
        WHERE tenant_id = :tenant_id {$statsSite} AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ");
    $statsStmt->execute($statsParams);
    $runStats = $statsStmt->fetch() ?: [];

    $sitesStmt = $pdo->prepare("SELECT id, name, domain FROM sites WHERE tenant_id = :tenant_id AND is_active = 1 ORDER BY name");
    $sitesStmt->execute([':tenant_id' => $tenantId]);
    $sites = $sitesStmt->fetchAll();

    $departmentsStmt = $pdo->prepare("SELECT id, site_id, name, color FROM departments WHERE tenant_id = :tenant_id AND is_active = 1 ORDER BY name");
    $departmentsStmt->execute([':tenant_id' => $tenantId]);
    $departments = $departmentsStmt->fetchAll();

    $agentsStmt = $pdo->prepare("SELECT id, name, email, role FROM users WHERE tenant_id = :tenant_id AND role IN ('customer_admin','agent') AND is_active = 1 ORDER BY name");
    $agentsStmt->execute([':tenant_id' => $tenantId]);
    $agents = $agentsStmt->fetchAll();

    $conversationParams = [':tenant_id' => $tenantId];
    $conversationSite = '';
    if ($siteId > 0) {
        $conversationSite = ' AND conversations.site_id = :conversation_site_id ';
        $conversationParams[':conversation_site_id'] = $siteId;
    }
    $conversationStmt = $pdo->prepare("
        SELECT conversations.id, conversations.status, conversations.priority, visitors.name AS visitor_name, sites.name AS site_name
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        WHERE sites.tenant_id = :tenant_id {$conversationSite}
        ORDER BY conversations.last_message_at DESC, conversations.id DESC LIMIT 25
    ");
    $conversationStmt->execute($conversationParams);
    $conversations = $conversationStmt->fetchAll();

    $workerStmt = $pdo->prepare("
        SELECT status, message, metadata_json, last_seen_at,
               TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS seconds_ago
        FROM system_service_heartbeats
        WHERE service_key = 'automation_worker'
        LIMIT 1
    ");
    $workerStmt->execute();
    $workerRow = $workerStmt->fetch() ?: null;
    $workerStaleSeconds = max(60, (int) app_env('SYSTEM_HEARTBEAT_STALE_SECONDS', 180));
    $workerSecondsAgo = $workerRow ? max(0, (int) ($workerRow['seconds_ago'] ?? 0)) : null;
    $workerStatus = 'never';
    if ($workerRow) {
        $workerStatus = ($workerRow['status'] ?? '') === 'down'
            ? 'down'
            : ($workerSecondsAgo !== null && $workerSecondsAgo <= $workerStaleSeconds ? 'healthy' : 'stale');
    }

    json_response([
        'success' => true,
        'catalogs' => [
            'triggers' => automation_trigger_catalog(),
            'conditions' => automation_condition_catalog(),
            'operators' => automation_operator_catalog(),
            'actions' => automation_action_catalog(),
        ],
        'stats' => [
            'active_rules' => count(array_filter($rules, static fn(array $rule): bool => $rule['is_active'])),
            'executions_7d' => (int) ($runStats['executions_7d'] ?? 0),
            'successes_7d' => (int) ($runStats['successes_7d'] ?? 0),
            'failures_7d' => (int) ($runStats['failures_7d'] ?? 0),
            'average_duration_ms' => (int) round((float) ($runStats['average_duration_ms'] ?? 0)),
            'open_alerts' => $openAlertCount,
            'sla_at_risk' => array_sum(array_column($policies, 'warning_count')),
            'sla_breached' => array_sum(array_column($policies, 'breached_count')),
        ],
        'rules' => $rules,
        'sla_policies' => $policies,
        'logs' => $logs,
        'alerts' => $alerts,
        'worker' => [
            'status' => $workerStatus,
            'last_seen_at' => $workerRow['last_seen_at'] ?? null,
            'seconds_ago' => $workerSecondsAgo,
            'message' => $workerRow['message'] ?? null,
            'metadata' => !empty($workerRow['metadata_json']) ? json_decode((string) $workerRow['metadata_json'], true) : null,
            'stale_after_seconds' => $workerStaleSeconds,
        ],
        'sites' => array_map(static fn(array $row): array => ['id' => (int) $row['id'], 'name' => $row['name'], 'domain' => $row['domain']], $sites),
        'departments' => array_map(static fn(array $row): array => ['id' => (int) $row['id'], 'site_id' => (int) $row['site_id'], 'name' => $row['name'], 'color' => $row['color']], $departments),
        'agents' => array_map(static fn(array $row): array => ['id' => (int) $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'role' => $row['role']], $agents),
        'conversations' => array_map(static fn(array $row): array => ['id' => (int) $row['id'], 'status' => $row['status'], 'priority' => $row['priority'], 'visitor_name' => $row['visitor_name'], 'site_name' => $row['site_name']], $conversations),
    ]);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'دریافت اطلاعات مرکز اتوماسیون ناموفق بود.'], 500);
}
