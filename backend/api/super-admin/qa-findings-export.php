<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
$user=require_auth($pdo);require_role($user,['super_admin']);require_admin_permission($user,'tests.export_findings');
if($_SERVER['REQUEST_METHOD']!=='GET')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$format=strtolower(trim((string)($_GET['format']??'csv')));$scope=trim((string)($_GET['scope']??'open'));$runId=max(0,(int)($_GET['run_id']??0));$securityOnly=filter_var($_GET['security_only']??false,FILTER_VALIDATE_BOOL);
if(!in_array($format,['csv','json'],true)||!in_array($scope,['open','all','run'],true))json_response(['success'=>false,'message'=>'فرمت یا محدوده خروجی معتبر نیست.'],422);
try{
    if($scope==='run'){
        if($runId<1)json_response(['success'=>false,'message'=>'شناسه اجرای تست لازم است.'],422);
        $stmt=$pdo->prepare("SELECT i.id,i.case_key,i.category,i.title,r.target_type,r.target_id,r.target_label,'run_item' registry_status,i.status test_status,i.severity,i.message,COALESCE(i.root_cause,i.message) root_cause,COALESCE(i.impact,CASE i.severity WHEN 'critical' THEN 'احتمال توقف سرویس یا ریسک امنیتی جدی وجود دارد.' WHEN 'high' THEN 'ممکن است قابلیت اصلی یا امنیت کاربران مختل شود.' WHEN 'medium' THEN 'بخشی از سامانه می‌تواند ناپایدار باشد.' WHEN 'low' THEN 'ریسک محدود یا مشکل نگهداری وجود دارد.' ELSE NULL END) impact,i.expected_value,i.actual_value,i.remediation,COALESCE(i.evidence_json,i.details_json) evidence_json,i.risk_score,i.confidence,i.owasp_category,i.cwe_id,i.affected_component,i.verification_mode,r.id last_run_id,r.created_at first_seen_at,r.finished_at last_seen_at,1 occurrence_count,NULL resolution_note FROM qa_test_run_items i INNER JOIN qa_test_runs r ON r.id=i.run_id WHERE i.run_id=:run_id AND i.status IN ('warning','failed','error') ORDER BY FIELD(i.severity,'critical','high','medium','low','info'),i.category,i.title");$stmt->execute([':run_id'=>$runId]);$rows=$stmt->fetchAll();
        $filename='qa-run-'.$runId.'-issues-'.date('Ymd-His');
    }else{
        $conditions=[];if($scope==='open')$conditions[]="f.status='open'";if($securityOnly)$conditions[]="f.risk_score IS NOT NULL";$where=$conditions!==[]?'WHERE '.implode(' AND ',$conditions):'';
        $rows=$pdo->query("SELECT f.id,f.case_key,f.category,f.title,f.target_type,f.target_id,f.target_label,f.status registry_status,f.test_status,f.severity,f.message,f.root_cause,f.impact,f.expected_value,f.actual_value,f.remediation,f.evidence_json,f.risk_score,f.confidence,f.owasp_category,f.cwe_id,f.affected_component,f.verification_mode,f.last_run_id,f.first_seen_at,f.last_seen_at,f.occurrence_count,f.resolution_note FROM qa_findings f {$where} ORDER BY FIELD(f.status,'open','ignored','resolved'),FIELD(f.severity,'critical','high','medium','low','info'),f.last_seen_at DESC")->fetchAll();
        $filename=($securityOnly?'qa-security-findings-':'qa-findings-').$scope.'-'.date('Ymd-His');
    }
    $normalized=array_map(static function(array $row):array{
        $evidence=$row['evidence_json']?json_decode($row['evidence_json'],true):null;
        unset($row['evidence_json']);$row['evidence']=$evidence;return $row;
    },$rows);
    if($format==='json'){
        header('Content-Type: application/json; charset=utf-8');header('Content-Disposition: attachment; filename="'.$filename.'.json"');
        echo json_encode(['generated_at'=>date('c'),'scope'=>$scope,'security_only'=>$securityOnly,'run_id'=>$runId?:null,'total'=>count($normalized),'findings'=>$normalized],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;
    }
    header('Content-Type: text/csv; charset=UTF-8');header('Content-Disposition: attachment; filename="'.$filename.'.csv"');echo "\xEF\xBB\xBF";
    $out=fopen('php://output','wb');
    fputcsv($out,['شناسه','کلید تست','دسته','عنوان','هدف','وضعیت ثبت','نتیجه تست','شدت','امتیاز ریسک','اطمینان','OWASP','CWE','بخش متاثر','روش بررسی','شرح مشکل','دلیل احتمالی','اثر و ریسک','مقدار مورد انتظار','مقدار فعلی','راهکار رفع','شواهد فنی','تعداد تکرار','اولین مشاهده','آخرین مشاهده','آخرین Run','یادداشت حل']);
    foreach($normalized as $row){
        fputcsv($out,[$row['id'],$row['case_key'],$row['category'],$row['title'],$row['target_label']??$row['target_type'],$row['registry_status'],$row['test_status'],$row['severity'],$row['risk_score']??null,$row['confidence']??null,$row['owasp_category']??null,$row['cwe_id']??null,$row['affected_component']??null,$row['verification_mode']??null,$row['message'],$row['root_cause'],$row['impact'],$row['expected_value'],$row['actual_value'],$row['remediation'],json_encode($row['evidence'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$row['occurrence_count'],$row['first_seen_at'],$row['last_seen_at'],$row['last_run_id'],$row['resolution_note']]);
    }
    fclose($out);exit;
}catch(Throwable $e){json_response(['success'=>false,'message'=>'ساخت خروجی ایرادات ناموفق بود.','request_id'=>defined('APP_REQUEST_ID')?APP_REQUEST_ID:null],500);}
