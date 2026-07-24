<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/admin-management.php';
require_once __DIR__ . '/../../includes/admin-impersonation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$actor=require_auth($pdo); require_role($actor,['super_admin']);
$input=get_json_input(); require_sensitive_confirmation($pdo,$actor,$input);
$id=(int)($input['id']??0); $unlock=!empty($input['unlock']); $active=!empty($input['is_active'])?1:0;
if($id<=0) json_response(['success'=>false,'message'=>'شناسه مدیر نامعتبر است.'],422);
if($unlock){$pdo->prepare('UPDATE users SET failed_login_attempts=0,locked_until=NULL,updated_at=NOW() WHERE id=:id AND role=\'super_admin\'')->execute([':id'=>$id]);admin_audit_log($pdo,$actor,'admin.unlocked','admin_user',$id,'قفل حساب مدیر باز شد',null,['locked'=>false],['target_user_id'=>$id]);json_response(['success'=>true,'message'=>'قفل حساب مدیر باز شد.']);}
if($id===(int)$actor['id'] && !$active) json_response(['success'=>false,'message'=>'نمی‌توانید حساب خودتان را غیرفعال کنید.'],422);
try{
 $pdo->beginTransaction();
 $q=$pdo->prepare("SELECT u.id,u.name,u.email,u.is_active,r.code AS role_code FROM users u LEFT JOIN admin_roles r ON r.id=u.admin_role_id WHERE u.id=:id AND u.role='super_admin' LIMIT 1 FOR UPDATE");
 $q->execute([':id'=>$id]); $old=$q->fetch(); if(!$old) throw new RuntimeException('مدیر پیدا نشد.');
 if(!$active && $old['role_code']==='owner' && admin_active_owner_count($pdo,$id)<1) throw new RuntimeException('آخرین مالک فعال را نمی‌توان غیرفعال کرد.');
 $pdo->prepare('UPDATE users SET is_active=:active,token_version=token_version+1,updated_at=NOW() WHERE id=:id')->execute([':active'=>$active,':id'=>$id]);
 if(!$active) {
     auth_revoke_sessions($pdo,$id,(int)$actor['id'],'Admin account deactivated');
     admin_impersonation_revoke_for_admin($pdo,$id,(int)$actor['id'],'Administrator account deactivated');
 }
 admin_audit_log($pdo,$actor,'admin.status_changed','admin_user',$id,'وضعیت مدیر تغییر کرد',['is_active'=>(bool)$old['is_active']],['is_active'=>(bool)$active],['target_user_id'=>$id]);
 $pdo->commit(); json_response(['success'=>true,'message'=>$active?'مدیر فعال شد.':'مدیر غیرفعال شد.']);
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();json_response(['success'=>false,'message'=>$e->getMessage()],422);}
