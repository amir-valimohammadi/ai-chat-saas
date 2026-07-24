<?php

declare(strict_types=1);

require_once __DIR__ . '/admin-access.php';
require_once __DIR__ . '/auth-session.php';

if (!function_exists('admin_role_by_id')) {
    function admin_role_by_id(PDO $pdo, int $roleId): ?array
    {
        $stmt = $pdo->prepare('SELECT id,code,name,is_system,is_active FROM admin_roles WHERE id=:id LIMIT 1');
        $stmt->execute([':id' => $roleId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}

if (!function_exists('admin_active_owner_count')) {
    function admin_active_owner_count(PDO $pdo, ?int $excludeUserId = null): int
    {
        $sql = "SELECT COUNT(*) FROM users u INNER JOIN admin_roles r ON r.id=u.admin_role_id\n                WHERE u.role='super_admin' AND u.is_active=1 AND r.code='owner'";
        $params = [];
        if ($excludeUserId !== null) {
            $sql .= ' AND u.id<>:exclude_id';
            $params[':exclude_id'] = $excludeUserId;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }
}

if (!function_exists('admin_assert_role_assignment_allowed')) {
    function admin_assert_role_assignment_allowed(array $actor, array $role): void
    {
        if (!(int) $role['is_active']) {
            json_response(['success' => false, 'message' => 'نقش انتخاب‌شده غیرفعال است.'], 422);
        }
        if ($role['code'] === 'owner' && empty($actor['is_platform_owner'])) {
            json_response(['success' => false, 'message' => 'فقط مالک پلتفرم می‌تواند نقش مالک را اختصاص دهد.'], 403);
        }
    }
}

if (!function_exists('admin_password_is_strong')) {
    function admin_password_is_strong(string $password): bool
    {
        return strlen($password) >= 10
            && strlen($password) <= 128
            && preg_match('/[A-Za-z]/', $password)
            && preg_match('/[0-9]/', $password)
            && preg_match('/[^A-Za-z0-9]/', $password);
    }
}
