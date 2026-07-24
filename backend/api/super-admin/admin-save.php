<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/admin-management.php';
require_once __DIR__ . '/../../includes/security-events.php';
require_once __DIR__ . '/../../includes/admin-impersonation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}
$actor = require_auth($pdo);
require_role($actor, ['super_admin']);
$input = get_json_input();
require_sensitive_confirmation($pdo, $actor, $input);

$id = max(0, (int) ($input['id'] ?? 0));
$name = trim((string) ($input['name'] ?? ''));
$email = strtolower(trim((string) ($input['email'] ?? '')));
$phone = trim((string) ($input['phone'] ?? ''));
$roleId = (int) ($input['admin_role_id'] ?? 0);
$mustChange = !empty($input['must_change_password']) ? 1 : 0;
$password = (string) ($input['password'] ?? '');

if ($name === '' || mb_strlen($name) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    json_response(['success' => false, 'message' => 'نام، ایمیل یا نقش معتبر نیست.'], 422);
}
$role = admin_role_by_id($pdo, $roleId);
if (!$role) {
    json_response(['success' => false, 'message' => 'نقش مدیریتی پیدا نشد.'], 422);
}
admin_assert_role_assignment_allowed($actor, $role);

try {
    $pdo->beginTransaction();
    if ($id === 0) {
        if (!admin_password_is_strong($password)) {
            throw new RuntimeException('رمز عبور باید حداقل ۱۰ کاراکتر و شامل حرف، عدد و نماد باشد.');
        }
        $exists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email=:email');
        $exists->execute([':email' => $email]);
        if ((int) $exists->fetchColumn() > 0) {
            throw new RuntimeException('این ایمیل قبلاً ثبت شده است.');
        }
        $stmt = $pdo->prepare("\n            INSERT INTO users(tenant_id,name,email,phone,password_hash,role,admin_role_id,is_active,token_version,must_change_password,availability_status,created_at)\n            VALUES(NULL,:name,:email,:phone,:password_hash,'super_admin',:admin_role_id,1,1,:must_change_password,'online',NOW())\n        ");
        $stmt->execute([
            ':name' => $name,
            ':email' => $email,
            ':phone' => $phone !== '' ? $phone : null,
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ':admin_role_id' => $roleId,
            ':must_change_password' => $mustChange,
        ]);
        $id = (int) $pdo->lastInsertId();
        admin_audit_log($pdo, $actor, 'admin.created', 'admin_user', $id, 'مدیر پلتفرم ایجاد شد', null, [
            'name' => $name,'email' => $email,'admin_role_id' => $roleId,'must_change_password' => (bool) $mustChange,
        ], ['target_user_id' => $id]);
        security_log_event($pdo, $id, 'admin_account_created', 'info', 'حساب مدیر پلتفرم ایجاد شد', ['created_by' => $actor['id']]);
    } else {
        $oldStmt = $pdo->prepare("\n            SELECT u.id,u.name,u.email,u.phone,u.admin_role_id,u.must_change_password,r.code AS role_code\n            FROM users u LEFT JOIN admin_roles r ON r.id=u.admin_role_id\n            WHERE u.id=:id AND u.role='super_admin' LIMIT 1 FOR UPDATE\n        ");
        $oldStmt->execute([':id' => $id]);
        $old = $oldStmt->fetch();
        if (!$old) {
            throw new RuntimeException('مدیر موردنظر پیدا نشد.');
        }
        if ($old['role_code'] === 'owner' && $role['code'] !== 'owner' && admin_active_owner_count($pdo, $id) < 1) {
            throw new RuntimeException('حداقل یک مالک فعال باید در سامانه باقی بماند.');
        }
        $exists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email=:email AND id<>:id');
        $exists->execute([':email' => $email, ':id' => $id]);
        if ((int) $exists->fetchColumn() > 0) {
            throw new RuntimeException('این ایمیل قبلاً ثبت شده است.');
        }
        $securityChanged =
            strtolower((string) $old['email']) !== $email ||
            (int) $old['admin_role_id'] !== $roleId ||
            (int) $old['must_change_password'] !== $mustChange;
        $stmt = $pdo->prepare("\n            UPDATE users SET name=:name,email=:email,phone=:phone,admin_role_id=:admin_role_id,\n                must_change_password=:must_change_password,token_version=token_version+:token_increment,updated_at=NOW()\n            WHERE id=:id AND role='super_admin'\n        ");
        $stmt->execute([
            ':name' => $name,
            ':email' => $email,
            ':phone' => $phone !== '' ? $phone : null,
            ':admin_role_id' => $roleId,
            ':must_change_password' => $mustChange,
            ':token_increment' => $securityChanged ? 1 : 0,
            ':id' => $id,
        ]);
        if ($securityChanged) {
            auth_revoke_sessions($pdo, $id, (int) $actor['id'], 'Admin email, role or password policy changed');
            admin_impersonation_revoke_for_admin($pdo, $id, (int) $actor['id'], 'Administrator security settings changed');
        }
        admin_audit_log($pdo, $actor, 'admin.updated', 'admin_user', $id, 'اطلاعات یا نقش مدیر تغییر کرد', $old, [
            'name' => $name,'email' => $email,'phone' => $phone,'admin_role_id' => $roleId,'must_change_password' => (bool) $mustChange,
        ], ['target_user_id' => $id]);
    }
    $pdo->commit();
    json_response(['success' => true, 'message' => 'اطلاعات مدیر ذخیره شد.', 'admin_id' => $id]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_response(['success' => false, 'message' => $e->getMessage()], 422);
}
