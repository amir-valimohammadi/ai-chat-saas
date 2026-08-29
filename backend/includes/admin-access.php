<?php

declare(strict_types=1);

if (!function_exists('admin_load_access')) {
    function admin_load_access(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare("\n            SELECT r.id, r.code, r.name, r.description, r.is_system, r.is_active\n            FROM users u\n            LEFT JOIN admin_roles r ON r.id = u.admin_role_id\n            WHERE u.id = :id AND u.role = 'super_admin'\n            LIMIT 1\n        ");
        $stmt->execute([':id' => $userId]);
        $role = $stmt->fetch();

        if (!$role || !(int) $role['is_active']) {
            return [
                'role_id' => null,
                'role_code' => null,
                'role_name' => null,
                'is_owner' => false,
                'permissions' => [],
            ];
        }

        $isOwner = $role['code'] === 'owner';
        if ($isOwner) {
            return [
                'role_id' => (int) $role['id'],
                'role_code' => $role['code'],
                'role_name' => $role['name'],
                'is_owner' => true,
                'permissions' => ['*'],
            ];
        }

        $permissionsStmt = $pdo->prepare("\n            SELECT p.code\n            FROM admin_role_permissions rp\n            INNER JOIN admin_permissions p ON p.id = rp.permission_id\n            WHERE rp.role_id = :role_id\n            ORDER BY p.code\n        ");
        $permissionsStmt->execute([':role_id' => (int) $role['id']]);

        return [
            'role_id' => (int) $role['id'],
            'role_code' => $role['code'],
            'role_name' => $role['name'],
            'is_owner' => false,
            'permissions' => array_values(array_map(
                static fn(array $row): string => (string) $row['code'],
                $permissionsStmt->fetchAll()
            )),
        ];
    }
}

if (!function_exists('admin_has_permission')) {
    function admin_has_permission(array $user, string $permission): bool
    {
        if (($user['role'] ?? null) !== 'super_admin') {
            return false;
        }

        $permissions = $user['permissions'] ?? [];
        return in_array('*', $permissions, true) || in_array($permission, $permissions, true);
    }
}

if (!function_exists('require_admin_permission')) {
    function require_admin_permission(array $user, string $permission): void
    {
        if (!admin_has_permission($user, $permission)) {
            json_response([
                'success' => false,
                'message' => 'شما مجوز لازم برای انجام این عملیات را ندارید.',
                'required_permission' => $permission,
            ], 403);
        }
    }
}

if (!function_exists('admin_permission_for_script')) {
    function admin_permission_for_script(string $script): ?string
    {
        $map = [
            'dashboard-stats.php' => 'dashboard.view',
            'contact-requests-count.php' => 'requests.view',
            'contact-requests-list.php' => 'requests.view',
            'contact-request-show.php' => 'requests.view',
            'contact-request-update.php' => 'requests.manage',
            'contact-request-note-create.php' => 'requests.manage',
            'customer-show.php' => 'customers.view',
            'customer-360.php' => 'customers.view',
            'global-search.php' => 'customers.view',
            'customer-profile-update.php' => 'customers.support',
            'customer-note-save.php' => 'customers.support',
            'customer-note-delete.php' => 'customers.support',
            'customer-tags-update.php' => 'customers.support',
            'customer-onboarding-update.php' => 'customers.support',
            'customer-export.php' => 'customers.export',
            'customer-impersonation-start.php' => 'customers.impersonate',
            'tenants-list.php' => 'customers.view',
            'tenants-options.php' => 'customers.view',
            'customer-create.php' => 'customers.manage',
            'customer-status-update.php' => 'customers.manage',
            'customer-plan-update.php' => 'customers.manage',
            'user-status-update.php' => 'customers.manage',
            'user-password-reset.php' => 'customers.manage',
            'sites-list.php' => 'sites.view',
            'site-status-update.php' => 'sites.manage',
            'site-settings-update.php' => 'sites.manage',
            'plans-list.php' => 'plans.view',
            'plan-create.php' => 'plans.manage',
            'plan-update.php' => 'plans.manage',
            'plan-toggle-status.php' => 'plans.manage',
            'subscriptions-list.php' => 'billing.view',
            'subscription-show.php' => 'billing.view',
            'subscription-create.php' => 'billing.manage',
            'subscription-payment-create.php' => 'billing.manage',
            'subscription-renew.php' => 'billing.manage',
            'subscription-status-update.php' => 'billing.manage',
            'ai-monitoring-stats.php' => 'ai.view',
            'operations-health.php' => 'operations.view',
            'operations-crawl-retry.php' => 'operations.manage',
            'operations-error-resolve.php' => 'operations.manage',
            'operations-maintenance-update.php' => 'operations.manage',
            'audit-logs-list.php' => 'audit.view',
            'announcements-list.php' => 'announcements.view',
            'announcement-create.php' => 'announcements.manage',
            'announcement-update.php' => 'announcements.manage',
            'announcement-delete.php' => 'announcements.manage',
            'announcement-image-upload.php' => 'announcements.manage',
            'admins-list.php' => 'admins.view',
            'admin-save.php' => 'admins.manage',
            'admin-status-update.php' => 'admins.manage',
            'admin-password-reset.php' => 'admins.manage',
            'admin-roles-list.php' => 'admins.view',
            'admin-role-save.php' => 'admins.manage',
            'admin-role-toggle.php' => 'admins.manage',
            'security-overview.php' => 'security.view',
            'security-session-revoke.php' => 'security.manage',
            'security-event-resolve.php' => 'security.manage',
            'security-ip-allowlist.php' => 'security.manage',
            'qa-overview.php' => 'tests.view',
            'qa-security-overview.php' => 'tests.view_security_evidence',
            'qa-runs-list.php' => 'tests.view',
            'qa-run-show.php' => 'tests.view',
            'qa-run-create.php' => 'tests.view',
            'qa-run-rerun-failed.php' => 'tests.view',
            'qa-artifact-download.php' => 'tests.view_artifacts',
            'qa-browser-run-cancel.php' => 'tests.cancel_runs',
            'qa-browser-run-start.php' => 'tests.run_browser',
            'qa-finding-update.php' => 'tests.manage_findings',
            'qa-findings-export.php' => 'tests.export_findings',
            'qa-findings-list.php' => 'tests.view',
        ];

        return $map[$script] ?? null;
    }
}

if (!function_exists('admin_enforce_current_script_permission')) {
    function admin_enforce_current_script_permission(array $user): void
    {
        $scriptPath = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        if (!str_contains($scriptPath, '/super-admin/')) {
            return;
        }

        $permission = admin_permission_for_script(basename($scriptPath));
        if ($permission === null) {
            if (($user['is_platform_owner'] ?? false) === true) {
                return;
            }

            json_response([
                'success' => false,
                'message' => 'مجوز این endpoint تعریف نشده است.',
            ], 403);
        }

        require_admin_permission($user, $permission);
    }
}

if (!function_exists('require_sensitive_confirmation')) {
    function require_sensitive_confirmation(PDO $pdo, array $actor, array $input): void
    {
        $password = (string) ($input['current_password'] ?? '');
        if ($password === '') {
            json_response([
                'success' => false,
                'message' => 'برای عملیات حساس، رمز عبور فعلی لازم است.',
            ], 422);
        }

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id=:id LIMIT 1');
        $stmt->execute([':id' => (int) $actor['id']]);
        $row = $stmt->fetch();

        if (!$row || !password_verify($password, (string) $row['password_hash'])) {
            json_response([
                'success' => false,
                'message' => 'رمز عبور فعلی صحیح نیست.',
            ], 401);
        }
    }
}
