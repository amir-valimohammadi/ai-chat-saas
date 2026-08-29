<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/qa-browser.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$input=get_json_input();
$runId=(int)($input['run_id']??0);$token=(string)($input['token']??'');
try{
    $run=qa_browser_validate_worker($pdo,$runId,$token);
    if(in_array($run['status'],['completed','failed','cancelled'],true)) throw new RuntimeException('این اجرا قبلاً پایان یافته است.');
    $pdo->prepare("UPDATE qa_test_runs SET status='running',started_at=COALESCE(started_at,NOW()),heartbeat_at=NOW(),progress_percent=1,error_message=NULL WHERE id=:id")
        ->execute([':id'=>$runId]);
    $context=qa_browser_prepare_fixture($pdo,$run);
    if(!is_dir($context['artifact_dir'])&&!mkdir($context['artifact_dir'],0775,true)&&!is_dir($context['artifact_dir'])) throw new RuntimeException('پوشه Artifact قابل ساخت نیست.');
    json_response(['success'=>true,'context'=>$context]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>safe_api_exception_message($e,'QA browser context could not be prepared.')],403);}
