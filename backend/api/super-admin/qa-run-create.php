<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/qa-test-runner.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo); require_role($user,['super_admin']);
$input=get_json_input();
$profile=trim((string)($input['profile']??'quick'));
$targetType=trim((string)($input['target_type']??'system'));
$targetId=isset($input['target_id'])?(int)$input['target_id']:null;
$reason=trim((string)($input['reason']??''));

if(!in_array($profile,['quick','full','security','operational'],true)) json_response(['success'=>false,'message'=>'نوع تست معتبر نیست.'],422);
if(!in_array($targetType,['system','tenant','site'],true)) json_response(['success'=>false,'message'=>'هدف تست معتبر نیست.'],422);
if($targetType!=='system'&&(!$targetId||$targetId<1)) json_response(['success'=>false,'message'=>'هدف تست را انتخاب کن.'],422);
if($profile==='operational'&&$targetType!=='system') json_response(['success'=>false,'message'=>'تست عملیاتی در این نسخه فقط روی هسته کل سامانه اجرا می‌شود.'],422);
if($profile==='quick') require_admin_permission($user,'tests.run_safe');
if($profile==='full') require_admin_permission($user,'tests.run_full');
if($profile==='operational') {
    require_admin_permission($user,'tests.run_operational');
    if((function_exists('mb_strlen')?mb_strlen($reason,'UTF-8'):strlen($reason))<5) json_response(['success'=>false,'message'=>'برای تست عملیاتی دلیل اجرا را وارد کن.'],422);
    require_sensitive_confirmation($pdo,$user,$input);
}
if($profile==='security') {
    require_admin_permission($user,'tests.run_security');
    if((function_exists('mb_strlen')?mb_strlen($reason,'UTF-8'):strlen($reason))<5) json_response(['success'=>false,'message'=>'برای تست امنیتی دلیل اجرا را وارد کن.'],422);
    require_sensitive_confirmation($pdo,$user,$input);
}

try {
    $scope=qa_scope($pdo,$targetType,$targetId);
    $runKey=bin2hex(random_bytes(16));
    $stmt=$pdo->prepare("INSERT INTO qa_test_runs (run_key,profile,target_type,target_id,target_label,status,environment,reason,triggered_by,triggered_by_name,metadata_json) VALUES (:run_key,:profile,:target_type,:target_id,:target_label,'queued',:environment,:reason,:triggered_by,:triggered_by_name,:metadata)");
    $stmt->execute([
        ':run_key'=>$runKey,':profile'=>$profile,':target_type'=>$targetType,':target_id'=>$targetId,':target_label'=>$scope['target_label'],
        ':environment'=>(string)app_env('APP_ENV','local'),':reason'=>$reason!==''?$reason:null,':triggered_by'=>(int)$user['id'],':triggered_by_name'=>$user['name'],
        ':metadata'=>json_encode(['ip'=>$_SERVER['REMOTE_ADDR']??null,'user_agent'=>substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,500)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
    ]);
    $runId=(int)$pdo->lastInsertId();
    admin_audit_log($pdo,$user,'qa_test_run_started','qa_test_run',$runId,'اجرای تست سامانه آغاز شد.',null,['profile'=>$profile,'target_type'=>$targetType,'target_id'=>$targetId,'reason'=>$reason]);
    $run=qa_execute_run($pdo,$runId);
    admin_audit_log($pdo,$user,'qa_test_run_completed','qa_test_run',$runId,'اجرای تست سامانه تکمیل شد.',null,['score_percent'=>$run['score_percent']??null,'failed_count'=>$run['failed_count']??null,'warning_count'=>$run['warning_count']??null]);
    json_response(['success'=>true,'message'=>'تست با موفقیت اجرا شد.','run_id'=>$runId,'run_key'=>$runKey,'run'=>$run]);
} catch(Throwable $e) {
    json_response(['success'=>false,'message'=>'اجرای تست ناموفق بود.','error'=>$e->getMessage()],500);
}
