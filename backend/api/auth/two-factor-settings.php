<?php

declare(strict_types=1);

require_once __DIR__.'/../../includes/cors.php';
require_once __DIR__.'/../../includes/response.php';
require_once __DIR__.'/../../includes/helpers.php';
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/admin-access.php';
require_once __DIR__.'/../../includes/auth-session.php';
require_once __DIR__.'/../../includes/security-events.php';
require_once __DIR__.'/../../includes/totp.php';

$user=require_auth($pdo);
if($user['role']!=='super_admin')json_response(['success'=>false,'message'=>'ورود دومرحله‌ای این بخش برای مدیران پلتفرم است.'],403);

if($_SERVER['REQUEST_METHOD']==='GET'){
 $stmt=$pdo->prepare('SELECT two_factor_enabled,two_factor_confirmed_at FROM users WHERE id=:id');$stmt->execute([':id'=>$user['id']]);$row=$stmt->fetch();
 $codes=$pdo->prepare('SELECT COUNT(*) FROM admin_two_factor_recovery_codes WHERE user_id=:id AND used_at IS NULL');$codes->execute([':id'=>$user['id']]);
 json_response(['success'=>true,'enabled'=>(bool)$row['two_factor_enabled'],'confirmed_at'=>$row['two_factor_confirmed_at'],'unused_recovery_codes'=>(int)$codes->fetchColumn()]);
}
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$in=get_json_input();$action=(string)($in['action']??'');

if($action==='begin'){
 $secret=totp_generate_secret();$issuer=rawurlencode((string)app_config('name','AI Chat SaaS'));$account=rawurlencode((string)$user['email']);
 json_response(['success'=>true,'secret'=>$secret,'otpauth_uri'=>"otpauth://totp/{$issuer}:{$account}?secret={$secret}&issuer={$issuer}&digits=6&period=30",'message'=>'کلید را در برنامه Authenticator وارد و سپس کد را تأیید کنید.']);
}

$currentPassword=(string)($in['current_password']??'');
$stmt=$pdo->prepare('SELECT password_hash,two_factor_enabled,two_factor_secret_encrypted FROM users WHERE id=:id LIMIT 1');$stmt->execute([':id'=>$user['id']]);$dbUser=$stmt->fetch();
if($currentPassword===''||!$dbUser||!password_verify($currentPassword,(string)$dbUser['password_hash']))json_response(['success'=>false,'message'=>'رمز عبور فعلی صحیح نیست.'],401);

try{$pdo->beginTransaction();
 if($action==='confirm'){
  $secret=strtoupper(trim((string)($in['secret']??'')));$code=(string)($in['code']??'');
  if($secret===''||!totp_verify($secret,$code))throw new RuntimeException('کد Authenticator صحیح نیست.');
  $encrypted=security_encrypt_secret($secret);$codes=totp_recovery_codes(8);
  $pdo->prepare('UPDATE users SET two_factor_enabled=1,two_factor_secret_encrypted=:secret,two_factor_confirmed_at=NOW(),token_version=token_version+1 WHERE id=:id')->execute([':secret'=>$encrypted,':id'=>$user['id']]);
  $pdo->prepare('DELETE FROM admin_two_factor_recovery_codes WHERE user_id=:id')->execute([':id'=>$user['id']]);$ins=$pdo->prepare('INSERT INTO admin_two_factor_recovery_codes(user_id,code_hash,created_at) VALUES(:user_id,:hash,NOW())');foreach($codes as $recovery)$ins->execute([':user_id'=>$user['id'],':hash'=>hash('sha256',$recovery)]);
  auth_revoke_sessions($pdo,(int)$user['id'],(int)$user['id'],'Two-factor authentication enabled');security_log_event($pdo,(int)$user['id'],'two_factor_enabled','info','ورود دومرحله‌ای فعال شد');
  $pdo->commit();json_response(['success'=>true,'message'=>'ورود دومرحله‌ای فعال شد. دوباره وارد شوید.','recovery_codes'=>$codes,'requires_relogin'=>true]);
 }
 if($action==='disable'){
  $code=strtoupper(trim((string)($in['code']??'')));$secret=security_decrypt_secret((string)$dbUser['two_factor_secret_encrypted']);$valid=$secret!==''&&totp_verify($secret,$code);
  if(!$valid&&preg_match('/^[A-F0-9]{8}$/',$code)){$hash=hash('sha256',$code);$q=$pdo->prepare('SELECT id FROM admin_two_factor_recovery_codes WHERE user_id=:user_id AND code_hash=:hash AND used_at IS NULL LIMIT 1');$q->execute([':user_id'=>$user['id'],':hash'=>$hash]);$valid=(bool)$q->fetchColumn();}
  if(!$valid)throw new RuntimeException('کد امنیتی صحیح نیست.');
  $pdo->prepare('UPDATE users SET two_factor_enabled=0,two_factor_secret_encrypted=NULL,two_factor_confirmed_at=NULL,token_version=token_version+1 WHERE id=:id')->execute([':id'=>$user['id']]);$pdo->prepare('DELETE FROM admin_two_factor_recovery_codes WHERE user_id=:id')->execute([':id'=>$user['id']]);auth_revoke_sessions($pdo,(int)$user['id'],(int)$user['id'],'Two-factor authentication disabled');security_log_event($pdo,(int)$user['id'],'two_factor_disabled','warning','ورود دومرحله‌ای غیرفعال شد');$pdo->commit();json_response(['success'=>true,'message'=>'ورود دومرحله‌ای غیرفعال شد. دوباره وارد شوید.','requires_relogin'=>true]);
 }
 if($action==='regenerate_recovery'){
  $code=(string)($in['code']??'');$secret=security_decrypt_secret((string)$dbUser['two_factor_secret_encrypted']);if(!$dbUser['two_factor_enabled']||$secret===''||!totp_verify($secret,$code))throw new RuntimeException('کد Authenticator صحیح نیست.');$codes=totp_recovery_codes(8);$pdo->prepare('DELETE FROM admin_two_factor_recovery_codes WHERE user_id=:id')->execute([':id'=>$user['id']]);$ins=$pdo->prepare('INSERT INTO admin_two_factor_recovery_codes(user_id,code_hash,created_at) VALUES(:user_id,:hash,NOW())');foreach($codes as $recovery)$ins->execute([':user_id'=>$user['id'],':hash'=>hash('sha256',$recovery)]);security_log_event($pdo,(int)$user['id'],'recovery_codes_regenerated','warning','کدهای بازیابی جدید ساخته شد');$pdo->commit();json_response(['success'=>true,'message'=>'کدهای بازیابی جدید ساخته شد.','recovery_codes'=>$codes]);
 }
 throw new RuntimeException('عملیات نامعتبر است.');
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();json_response(['success'=>false,'message'=>$e->getMessage()],422);}
