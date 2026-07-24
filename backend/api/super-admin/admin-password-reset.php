<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';
require_once __DIR__.'/../../includes/response.php';
require_once __DIR__.'/../../includes/helpers.php';
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/admin-audit.php';
require_once __DIR__.'/../../includes/admin-management.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$actor=require_auth($pdo);require_role($actor,['super_admin']);$in=get_json_input();require_sensitive_confirmation($pdo,$actor,$in);
$id=(int)($in['id']??0);$password=(string)($in['new_password']??'');
if($id<=0||!admin_password_is_strong($password))json_response(['success'=>false,'message'=>'رمز جدید باید حداقل ۱۰ کاراکتر و شامل حرف، عدد و نماد باشد.'],422);
try{$pdo->beginTransaction();$q=$pdo->prepare("SELECT id,name,email FROM users WHERE id=:id AND role='super_admin' LIMIT 1 FOR UPDATE");$q->execute([':id'=>$id]);$target=$q->fetch();if(!$target)throw new RuntimeException('مدیر پیدا نشد.');
$pdo->prepare('UPDATE users SET password_hash=:hash,token_version=token_version+1,must_change_password=1,failed_login_attempts=0,locked_until=NULL,updated_at=NOW() WHERE id=:id')->execute([':hash'=>password_hash($password,PASSWORD_DEFAULT),':id'=>$id]);
auth_revoke_sessions($pdo,$id,(int)$actor['id'],'Administrator password reset');
admin_audit_log($pdo,$actor,'admin.password_reset','admin_user',$id,'رمز مدیر بازنشانی و نشست‌های او لغو شد',null,['must_change_password'=>true,'sessions_revoked'=>true],['target_user_id'=>$id]);
$pdo->commit();json_response(['success'=>true,'message'=>'رمز مدیر بازنشانی شد.']);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();json_response(['success'=>false,'message'=>$e->getMessage()],422);}
