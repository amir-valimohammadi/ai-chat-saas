<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/audit-logs-list.php
// هدف: دریافت صفحه‌بندی‌شده گزارش فعالیت‌های حساس Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$search = trim((string) ($_GET['search'] ?? ''));
$action = trim((string) ($_GET['action'] ?? ''));
$entityType = trim((string) ($_GET['entity_type'] ?? ''));
$tenantId = (int) ($_GET['tenant_id'] ?? 0);
$days = (int) ($_GET['days'] ?? 30);
$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = min(100, max(10, (int) ($_GET['per_page'] ?? 20)));

if (!in_array($days, [0, 7, 30, 90, 365], true)) {
    $days = 30;
}

if (!in_array($entityType, ['', 'tenant', 'site', 'user', 'plan'], true)) {
    json_response(['success' => false, 'message' => 'Invalid entity_type'], 422);
}

$offset = ($page - 1) * $perPage;

try {
    $where = ['1 = 1'];
    $params = [];

    if ($days > 0) {
        $where[] = 'logs.created_at >= :start_date';
        $params[':start_date'] = date(
            'Y-m-d 00:00:00',
            strtotime('-' . ($days - 1) . ' days')
        );
    }

    if ($search !== '') {
        $where[] = "(
            logs.description LIKE :search
            OR logs.actor_name LIKE :search
            OR logs.actor_email LIKE :search
            OR logs.action LIKE :search
            OR logs.entity_type LIKE :search
            OR CAST(logs.entity_id AS CHAR) LIKE :search
        )";
        $params[':search'] = '%' . $search . '%';
    }

    if ($action !== '') {
        $where[] = 'logs.action = :action';
        $params[':action'] = $action;
    }

    if ($entityType !== '') {
        $where[] = 'logs.entity_type = :entity_type';
        $params[':entity_type'] = $entityType;
    }

    if ($tenantId > 0) {
        $where[] = 'logs.tenant_id = :tenant_id';
        $params[':tenant_id'] = $tenantId;
    }

    $whereSql = implode(' AND ', $where);

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM admin_audit_logs AS logs WHERE {$whereSql}");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $summaryStmt = $pdo->prepare("\n        SELECT\n            COUNT(*) AS total,\n            SUM(CASE WHEN DATE(logs.created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,\n            SUM(CASE WHEN logs.action LIKE '%.status_changed' THEN 1 ELSE 0 END) AS status_changes,\n            SUM(CASE WHEN logs.action = 'user.password_reset' THEN 1 ELSE 0 END) AS password_resets,\n            SUM(CASE WHEN logs.action IN (\n                'customer.plan_changed', 'plan.created', 'plan.updated', 'plan.status_changed'\n            ) THEN 1 ELSE 0 END) AS plan_changes\n        FROM admin_audit_logs AS logs\n        WHERE {$whereSql}\n    ");
    $summaryStmt->execute($params);
    $summary = $summaryStmt->fetch() ?: [];

    $stmt = $pdo->prepare("\n        SELECT\n            logs.id, logs.actor_user_id, logs.actor_name, logs.actor_email, logs.actor_role,\n            logs.action, logs.entity_type, logs.entity_id, logs.tenant_id, tenants.name AS tenant_name,\n            logs.site_id, logs.target_user_id, logs.plan_id, logs.description,\n            logs.old_values_json, logs.new_values_json, logs.ip_address, logs.user_agent, logs.created_at\n        FROM admin_audit_logs AS logs\n        LEFT JOIN tenants ON tenants.id = logs.tenant_id\n        WHERE {$whereSql}\n        ORDER BY logs.id DESC\n        LIMIT {$perPage} OFFSET {$offset}\n    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $decode = static function ($value): ?array {
        if ($value === null || $value === '') {
            return null;
        }
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : null;
    };

    $logs = array_map(static function ($row) use ($decode) {
        return [
            'id' => (int) $row['id'],
            'actor' => [
                'id' => $row['actor_user_id'] !== null ? (int) $row['actor_user_id'] : null,
                'name' => $row['actor_name'],
                'email' => $row['actor_email'],
                'role' => $row['actor_role'],
            ],
            'action' => $row['action'],
            'entity_type' => $row['entity_type'],
            'entity_id' => $row['entity_id'] !== null ? (int) $row['entity_id'] : null,
            'tenant_id' => $row['tenant_id'] !== null ? (int) $row['tenant_id'] : null,
            'tenant_name' => $row['tenant_name'],
            'site_id' => $row['site_id'] !== null ? (int) $row['site_id'] : null,
            'target_user_id' => $row['target_user_id'] !== null ? (int) $row['target_user_id'] : null,
            'plan_id' => $row['plan_id'] !== null ? (int) $row['plan_id'] : null,
            'description' => $row['description'],
            'old_values' => $decode($row['old_values_json']),
            'new_values' => $decode($row['new_values_json']),
            'ip_address' => $row['ip_address'],
            'user_agent' => $row['user_agent'],
            'created_at' => $row['created_at'],
        ];
    }, $rows);

    $actionsStmt = $pdo->query("SELECT DISTINCT action FROM admin_audit_logs ORDER BY action ASC");
    $actions = array_map(static fn($row) => (string) $row['action'], $actionsStmt->fetchAll());

    $tenantsStmt = $pdo->query("SELECT id, name FROM tenants ORDER BY name ASC, id ASC");
    $tenants = array_map(static fn($row) => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
    ], $tenantsStmt->fetchAll());

    json_response([
        'success' => true,
        'logs' => $logs,
        'summary' => [
            'total' => (int) ($summary['total'] ?? 0),
            'today' => (int) ($summary['today'] ?? 0),
            'status_changes' => (int) ($summary['status_changes'] ?? 0),
            'password_resets' => (int) ($summary['password_resets'] ?? 0),
            'plan_changes' => (int) ($summary['plan_changes'] ?? 0),
        ],
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $total > 0 ? (int) ceil($total / $perPage) : 0,
        ],
        'filters' => [
            'actions' => $actions,
            'tenants' => $tenants,
        ],
    ]);
} catch (Throwable $e) {
    $payload = ['success' => false, 'message' => 'Failed to load audit logs'];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
