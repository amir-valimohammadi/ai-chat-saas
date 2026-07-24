<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
if($_SERVER['REQUEST_METHOD']!=='GET') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo); require_role($user,['super_admin']);
$page=max(1,(int)($_GET['page']??1)); $perPage=min(50,max(5,(int)($_GET['per_page']??15))); $offset=($page-1)*$perPage;
$status=trim((string)($_GET['status']??'all')); $profile=trim((string)($_GET['profile']??'all'));
$where=[];$params=[];
if(in_array($status,['queued','running','completed','failed','cancelled'],true)){ $where[]='status=:status';$params[':status']=$status; }
if(in_array($profile,['quick','full','security','operational'],true)){ $where[]='profile=:profile';$params[':profile']=$profile; }
$sqlWhere=$where?'WHERE '.implode(' AND ',$where):'';
try{
    $countStmt=$pdo->prepare("SELECT COUNT(*) FROM qa_test_runs {$sqlWhere}");$countStmt->execute($params);$total=(int)$countStmt->fetchColumn();
    $stmt=$pdo->prepare("SELECT id,run_key,profile,target_type,target_id,target_label,status,total_count,passed_count,warning_count,failed_count,skipped_count,score_percent,duration_ms,environment,reason,triggered_by,triggered_by_name,started_at,finished_at,error_message,created_at FROM qa_test_runs {$sqlWhere} ORDER BY id DESC LIMIT {$perPage} OFFSET {$offset}");$stmt->execute($params);
    json_response(['success'=>true,'runs'=>$stmt->fetchAll(),'pagination'=>['page'=>$page,'per_page'=>$perPage,'total'=>$total,'pages'=>(int)ceil($total/$perPage)]]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>'دریافت تاریخچه تست ناموفق بود.','error'=>$e->getMessage()],500);}
