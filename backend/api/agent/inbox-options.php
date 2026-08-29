<?php

// Inbox filter options for accessible sites and tenant agents.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

try {
    if ($user['role'] === 'customer_admin') {
        $sitesStmt = $pdo->prepare("SELECT id, name FROM sites WHERE tenant_id = :tenant_id ORDER BY name ASC");
        $sitesStmt->execute([':tenant_id' => (int) $user['tenant_id']]);
    } else {
        $sitesStmt = $pdo->prepare("
            SELECT sites.id, sites.name
            FROM sites
            INNER JOIN agent_site_access ON agent_site_access.site_id = sites.id
            WHERE sites.tenant_id = :tenant_id
              AND agent_site_access.user_id = :user_id
            ORDER BY sites.name ASC
        ");
        $sitesStmt->execute([
            ':tenant_id' => (int) $user['tenant_id'],
            ':user_id' => (int) $user['id'],
        ]);
    }

    $agentsStmt = $pdo->prepare("
        SELECT id, name, email, role, is_active
        FROM users
        WHERE tenant_id = :tenant_id
          AND role IN ('customer_admin', 'agent')
        ORDER BY is_active DESC, name ASC
    ");
    $agentsStmt->execute([':tenant_id' => (int) $user['tenant_id']]);

    if ($user['role'] === 'customer_admin') {
        $departmentsStmt = $pdo->prepare("
            SELECT departments.id, departments.name, departments.site_id, sites.name AS site_name, departments.color
            FROM departments INNER JOIN sites ON sites.id = departments.site_id
            WHERE departments.tenant_id = :tenant_id AND departments.is_active = 1
            ORDER BY sites.name ASC, departments.is_default DESC, departments.name ASC
        " );
        $departmentsStmt->execute([':tenant_id' => (int) $user['tenant_id']]);
    } else {
        $departmentsStmt = $pdo->prepare("
            SELECT DISTINCT departments.id, departments.name, departments.site_id, sites.name AS site_name, departments.color
            FROM departments
            INNER JOIN sites ON sites.id = departments.site_id
            INNER JOIN agent_site_access ON agent_site_access.site_id = departments.site_id
            WHERE departments.tenant_id = :tenant_id AND departments.is_active = 1
              AND agent_site_access.user_id = :user_id
            ORDER BY sites.name ASC, departments.is_default DESC, departments.name ASC
        " );
        $departmentsStmt->execute([':tenant_id' => (int) $user['tenant_id'], ':user_id' => (int) $user['id']]);
    }

    json_response([
        'success' => true,
        'sites' => array_map(static fn ($site) => [
            'id' => (int) $site['id'],
            'name' => $site['name'],
        ], $sitesStmt->fetchAll()),
        'agents' => array_map(static fn ($agent) => [
            'id' => (int) $agent['id'],
            'name' => $agent['name'],
            'email' => $agent['email'],
            'role' => $agent['role'],
            'is_active' => (bool) $agent['is_active'],
        ], $agentsStmt->fetchAll()),
        'departments' => array_map(static fn ($department) => [
            'id' => (int) $department['id'],
            'name' => $department['name'],
            'site_id' => (int) $department['site_id'],
            'site_name' => $department['site_name'],
            'color' => $department['color'],
        ], $departmentsStmt->fetchAll()),
        'priorities' => [
            ['value' => 'low', 'label' => 'کم'],
            ['value' => 'normal', 'label' => 'عادی'],
            ['value' => 'high', 'label' => 'بالا'],
            ['value' => 'urgent', 'label' => 'فوری'],
        ],
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load inbox options',
        ...safe_api_exception_context($e),
    ], 500);
}
