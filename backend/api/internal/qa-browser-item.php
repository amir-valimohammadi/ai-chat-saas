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
    $caseKey=substr(trim((string)($input['case_key']??'')),0,150);
    $status=(string)($input['status']??'error');
    if($caseKey===''||!in_array($status,['passed','warning','failed','skipped','error'],true))throw new RuntimeException('نتیجه تست معتبر نیست.');
    $case=['key'=>$caseKey,'category'=>substr((string)($input['category']??'browser'),0,80),'title'=>substr((string)($input['title']??$caseKey),0,255),'description'=>substr((string)($input['description']??''),0,500)];
    $result=[
        'status'=>$status,'severity'=>in_array((string)($input['severity']??'medium'),['info','low','medium','high','critical'],true)?(string)$input['severity']:'medium',
        'message'=>$input['message']??null,'root_cause'=>$input['root_cause']??null,'impact'=>$input['impact']??null,
        'expected'=>$input['expected_value']??null,'actual'=>$input['actual_value']??null,'remediation'=>$input['remediation']??null,
        'details'=>$input['details']??[],'evidence'=>$input['evidence']??[],
    ];
    $pdo->prepare('DELETE FROM qa_test_run_items WHERE run_id=:run_id AND case_key=:case_key')->execute([':run_id'=>$runId,':case_key'=>$caseKey]);
    qa_insert_item($pdo,$runId,$case,$result,max(0,(int)($input['duration_ms']??0)));
    $itemId=(int)$pdo->lastInsertId();

    $artifactRoot=qa_browser_artifact_root();
    foreach(($input['artifacts']??[]) as $artifact){
        if(!is_array($artifact))continue;
        $relative=ltrim(str_replace('\\','/',(string)($artifact['path']??'')),'/');
        $full=$artifactRoot.'/'.$relative;
        $realRoot=realpath($artifactRoot);$realFile=realpath($full);
        if(!$realRoot||!$realFile||!str_starts_with(str_replace('\\','/',$realFile),str_replace('\\','/',$realRoot).'/')||!is_file($realFile))continue;
        $type=(string)($artifact['type']??'log');if(!in_array($type,['screenshot','trace','console','network','video','html','json','log'],true))$type='log';
        $pdo->prepare("INSERT INTO qa_test_artifacts(run_id,run_item_id,artifact_type,display_name,storage_path,mime_type,size_bytes,sha256,metadata_json) VALUES(:run,:item,:type,:name,:path,:mime,:size,:sha,:meta)")
            ->execute([':run'=>$runId,':item'=>$itemId,':type'=>$type,':name'=>substr((string)($artifact['name']??basename($realFile)),0,255),':path'=>$relative,':mime'=>$artifact['mime_type']??null,':size'=>filesize($realFile)?:0,':sha'=>hash_file('sha256',$realFile),':meta'=>isset($artifact['metadata'])?json_encode($artifact['metadata'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES):null]);
    }
    $completed=(int)$pdo->query('SELECT COUNT(*) FROM qa_test_run_items WHERE run_id='.(int)$runId)->fetchColumn();
    $total=max($completed,(int)($input['total_cases']??$completed));
    $progress=$total>0?min(99,round(($completed/$total)*100,2)):1;
    $pdo->prepare('UPDATE qa_test_runs SET progress_percent=:progress,current_case_key=:case_key,heartbeat_at=NOW() WHERE id=:id')->execute([':progress'=>$progress,':case_key'=>$caseKey,':id'=>$runId]);
    json_response(['success'=>true,'item_id'=>$itemId,'progress_percent'=>$progress]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>$e->getMessage()],422);}
