<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/qa-test-runner.php';
require_once __DIR__ . '/../../includes/qa-browser.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);$input=get_json_input();$sourceId=(int)($input['source_run_id']??0);if($sourceId<1)json_response(['success'=>false,'message'=>'اجرای مبنا معتبر نیست.'],422);
try{
    $stmt=$pdo->prepare('SELECT * FROM qa_test_runs WHERE id=:id LIMIT 1');$stmt->execute([':id'=>$sourceId]);$source=$stmt->fetch();if(!$source)json_response(['success'=>false,'message'=>'اجرای مبنا پیدا نشد.'],404);
    $permission=$source['profile']==='security_deep'?'tests.run_security_deep':($source['profile']==='security'?'tests.run_security':($source['profile']==='operational'?'tests.run_operational':($source['profile']==='browser'?'tests.run_browser':($source['profile']==='full'?'tests.run_full':'tests.run_safe'))));require_admin_permission($user,$permission);
    if(in_array($source['profile'],['security','security_deep','operational'],true))require_sensitive_confirmation($pdo,$user,$input);
    $keysStmt=$pdo->prepare("SELECT case_key FROM qa_test_run_items WHERE run_id=:id AND status IN ('failed','error','warning')");$keysStmt->execute([':id'=>$sourceId]);$keys=array_column($keysStmt->fetchAll(),'case_key');if($keys===[])json_response(['success'=>false,'message'=>'تست ناموفق یا هشدار برای اجرای مجدد وجود ندارد.'],422);
    $runKey=bin2hex(random_bytes(16));$insert=$pdo->prepare("INSERT INTO qa_test_runs (run_key,profile,target_type,target_id,target_label,status,environment,reason,triggered_by,triggered_by_name,metadata_json) VALUES (:key,:profile,:target_type,:target_id,:label,'queued',:environment,:reason,:actor,:actor_name,:metadata)");
    $insert->execute([':key'=>$runKey,':profile'=>$source['profile'],':target_type'=>$source['target_type'],':target_id'=>$source['target_id'],':label'=>$source['target_label'],':environment'=>app_env('APP_ENV','local'),':reason'=>'اجرای مجدد موارد ناموفق Run #'.$sourceId,':actor'=>$user['id'],':actor_name'=>$user['name'],':metadata'=>json_encode(['source_run_id'=>$sourceId,'selected_cases'=>$keys],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
    $runId=(int)$pdo->lastInsertId();
    if($source['profile']==='browser'){qa_browser_create_worker_token($pdo,$runId);$spawn=qa_browser_spawn_worker($runId);admin_audit_log($pdo,$user,'qa_test_failed_rerun','qa_test_run',$runId,'تست مرورگری دوباره در صف قرار گرفت.',null,['source_run_id'=>$sourceId]);json_response(['success'=>true,'message'=>'تست مرورگری دوباره در صف قرار گرفت.','run_id'=>$runId,'queued'=>true,'worker'=>$spawn]);}
    $run=qa_execute_run($pdo,$runId,$keys);admin_audit_log($pdo,$user,'qa_test_failed_rerun','qa_test_run',$runId,'موارد ناموفق تست دوباره اجرا شدند.',null,['source_run_id'=>$sourceId,'case_count'=>count($keys)]);
    json_response(['success'=>true,'message'=>'موارد ناموفق دوباره اجرا شدند.','run_id'=>$runId,'run'=>$run]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>'اجرای مجدد تست‌ها ناموفق بود.','request_id'=>defined('APP_REQUEST_ID')?APP_REQUEST_ID:null],500);}
