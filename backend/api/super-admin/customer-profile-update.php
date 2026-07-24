<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';
require_once __DIR__.'/../../includes/response.php';
require_once __DIR__.'/../../includes/helpers.php';
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/admin-audit.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);
$input=get_json_input();
$tenantId=filter_var($input['tenant_id']??0,FILTER_VALIDATE_INT,['options'=>['default'=>0,'min_range'=>1]]);
$stage=(string)($input['lifecycle_stage']??'active');
$reason=trim((string)($input['suspension_reason']??''));
$managerId=filter_var($input['account_manager_id']??null,FILTER_VALIDATE_INT,['options'=>['default'=>0,'min_range'=>1]]);
if($tenantId<=0||!in_array($stage,['onboarding','active','at_risk','paused','churned'],true))json_response(['success'=>false,'message'=>'اطلاعات پرونده معتبر نیست.'],422);
if(strlen($reason)>1000)json_response(['success'=>false,'message'=>'دلیل ثبت‌شده بیش از حد طولانی است.'],422);
try{
 $stmt=$pdo->prepare('SELECT id,name,lifecycle_stage,suspension_reason,account_manager_id FROM tenants WHERE id=:id LIMIT 1');$stmt->execute([':id'=>$tenantId]);$old=$stmt->fetch();
 if(!$old)json_response(['success'=>false,'message'=>'مشتری پیدا نشد.'],404);
 if($managerId>0){$m=$pdo->prepare("SELECT id FROM users WHERE id=:id AND role='super_admin' AND is_active=1 LIMIT 1");$m->execute([':id'=>$managerId]);if(!$m->fetchColumn())json_response(['success'=>false,'message'=>'مدیر حساب انتخاب‌شده معتبر نیست.'],422);}else{$managerId=null;}
 $pdo->prepare('UPDATE tenants SET lifecycle_stage=:stage,suspension_reason=:reason,account_manager_id=:manager WHERE id=:id')->execute([':stage'=>$stage,':reason'=>$reason!==''?$reason:null,':manager'=>$managerId,':id'=>$tenantId]);
 admin_audit_log($pdo,$user,'customer.profile_updated','tenant',$tenantId,'پرونده پشتیبانی مشتری «'.$old['name'].'» ویرایش شد.',['lifecycle_stage'=>$old['lifecycle_stage'],'suspension_reason'=>$old['suspension_reason'],'account_manager_id'=>$old['account_manager_id']],['lifecycle_stage'=>$stage,'suspension_reason'=>$reason!==''?$reason:null,'account_manager_id'=>$managerId],['tenant_id'=>$tenantId]);
 json_response(['success'=>true,'message'=>'پرونده مشتری بروزرسانی شد.']);
}catch(Throwable $e){error_log('[CUSTOMER_PROFILE_UPDATE] '.$e->getMessage());json_response(['success'=>false,'message'=>'بروزرسانی پرونده ناموفق بود.'],500);}
