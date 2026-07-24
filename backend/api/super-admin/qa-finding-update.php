<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);require_admin_permission($user,'tests.manage_findings');
$input=get_json_input();$id=(int)($input['id']??0);$action=trim((string)($input['action']??''));$note=trim((string)($input['note']??''));
if($id<1||!in_array($action,['resolve','reopen','ignore'],true))json_response(['success'=>false,'message'=>'درخواست مدیریت ایراد معتبر نیست.'],422);
try{
    $stmt=$pdo->prepare('SELECT * FROM qa_findings WHERE id=:id LIMIT 1');$stmt->execute([':id'=>$id]);$before=$stmt->fetch();if(!$before)json_response(['success'=>false,'message'=>'ایراد پیدا نشد.'],404);
    if($action==='reopen'){$status='open';$sql="UPDATE qa_findings SET status='open',resolved_by=NULL,resolved_at=NULL,resolution_note=:note WHERE id=:id";}
    elseif($action==='ignore'){$status='ignored';$sql="UPDATE qa_findings SET status='ignored',resolved_by=:actor,resolved_at=NOW(),resolution_note=:note WHERE id=:id";}
    else{$status='resolved';$sql="UPDATE qa_findings SET status='resolved',resolved_by=:actor,resolved_at=NOW(),resolution_note=:note WHERE id=:id";}
    $params=[':id'=>$id,':note'=>$note!==''?$note:null];if($action!=='reopen')$params[':actor']=(int)$user['id'];
    $pdo->prepare($sql)->execute($params);
    admin_audit_log($pdo,$user,'qa_finding_'.$action,'qa_finding',$id,'وضعیت ایراد مرکز تست تغییر کرد.',['status'=>$before['status']],['status'=>$status,'note'=>$note]);
    json_response(['success'=>true,'message'=>'وضعیت ایراد بروزرسانی شد.','status'=>$status]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>'بروزرسانی ایراد ناموفق بود.','request_id'=>defined('APP_REQUEST_ID')?APP_REQUEST_ID:null],500);}
