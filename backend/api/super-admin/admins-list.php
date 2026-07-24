<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}
$user = require_auth($pdo);
require_role($user, ['super_admin']);

$q = trim((string) ($_GET['q'] ?? ''));
$status = trim((string) ($_GET['status'] ?? 'all'));
$roleId = max(0, (int) ($_GET['role_id'] ?? 0));
$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = min(100, max(10, (int) ($_GET['per_page'] ?? 30)));
$offset = ($page - 1) * $perPage;

$where = ["u.role='super_admin'"];
$params = [];
if ($q !== '') {
    $where[] = '(u.name LIKE :q OR u.email LIKE :q OR u.phone LIKE :q)';
    $params[':q'] = '%' . $q . '%';
}
if ($status === 'active') {
    $where[] = 'u.is_active=1';
} elseif ($status === 'inactive') {
    $where[] = 'u.is_active=0';
} elseif ($status === 'locked') {
    $where[] = 'u.locked_until > NOW()';
}
if ($roleId > 0) {
    $where[] = 'u.admin_role_id=:role_id';
    $params[':role_id'] = $roleId;
}
$whereSql = implode(' AND ', $where);

$count = $pdo->prepare("SELECT COUNT(*) FROM users u WHERE {$whereSql}");
$count->execute($params);
$total = (int) $count->fetchColumn();

$stmt = $pdo->prepare("\n    SELECT u.id,u.name,u.email,u.phone,u.is_active,u.admin_role_id,u.must_change_password,\n           u.two_factor_enabled,u.ip_allowlist_enabled,u.failed_login_attempts,u.locked_until,\n           u.last_login_at,u.last_login_ip,u.last_seen_at,u.created_at,u.updated_at,\n           r.code AS admin_role_code,r.name AS admin_role_name,r.is_system AS admin_role_is_system,\n           (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>NOW()) AS active_sessions\n    FROM users u\n    LEFT JOIN admin_roles r ON r.id=u.admin_role_id\n    WHERE {$whereSql}\n    ORDER BY (r.code='owner') DESC,u.is_active DESC,u.id ASC\n    LIMIT {$perPage} OFFSET {$offset}\n");
$stmt->execute($params);
$admins = $stmt->fetchAll();

$roles = $pdo->query("\n    SELECT r.id,r.code,r.name,r.description,r.is_system,r.is_active,\n           COUNT(DISTINCT u.id) AS admins_count,COUNT(DISTINCT rp.permission_id) AS permissions_count\n    FROM admin_roles r\n    LEFT JOIN users u ON u.admin_role_id=r.id AND u.role='super_admin'\n    LEFT JOIN admin_role_permissions rp ON rp.role_id=r.id\n    GROUP BY r.id ORDER BY (r.code='owner') DESC,r.is_system DESC,r.name\n")->fetchAll();

json_response([
    'success' => true,
    'admins' => $admins,
    'roles' => $roles,
    'pagination' => [
        'page' => $page,
        'per_page' => $perPage,
        'total' => $total,
        'total_pages' => max(1, (int) ceil($total / $perPage)),
    ],
    'current_admin' => [
        'id' => $user['id'],
        'is_owner' => !empty($user['is_platform_owner']),
    ],
]);
