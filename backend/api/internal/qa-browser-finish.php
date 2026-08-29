<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/qa-browser.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$input=get_json_input();$runId=(int)($input['run_id']??0);$token=(string)($input['token']??'');
try{
    qa_browser_validate_worker($pdo,$runId,$token);
    $cleanup=qa_browser_cleanup_fixture($pdo,$runId);
    if(!$cleanup['cleaned']){
        $case=['key'=>'browser.fixture_cleanup','category'=>'browser','title'=>'پاک‌سازی داده مصنوعی','description'=>'داده‌های مصنوعی تست مرورگر باید حذف شوند.'];
        $result=qa_result('warning','پاک‌سازی خودکار محیط مصنوعی کامل نشد.','high',$cleanup['message'],'داده مصنوعی حذف شود.','شناسه Tenant را از جدول qa_browser_fixtures بررسی و حذف کن.',['cleanup'=>$cleanup], 'محدودیت Foreign Key یا خطای دیتابیس مانع حذف شده است.','باقی‌ماندن داده آزمایشی می‌تواند گزارش‌ها را آلوده کند.');
        $pdo->prepare('DELETE FROM qa_test_run_items WHERE run_id=:run AND case_key=:key')->execute([':run'=>$runId,':key'=>$case['key']]);
        qa_insert_item($pdo,$runId,$case,$result,0);
    }
    $requested=(string)($input['status']??'completed');
    $status=in_array($requested,['completed','failed','cancelled'],true)?$requested:'completed';
    $run=qa_browser_finalize_run($pdo,$runId,$status,$input['error']??null);
    json_response(['success'=>true,'run'=>$run,'cleanup'=>$cleanup]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>safe_api_exception_message($e,'QA browser run could not be finalized.')],422);}
