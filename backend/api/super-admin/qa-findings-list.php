<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if($_SERVER['REQUEST_METHOD']!=='GET') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo); require_role($user,['super_admin']); require_admin_permission($user,'tests.view');
$page=max(1,(int)($_GET['page']??1));$perPage=min(100,max(10,(int)($_GET['per_page']??25)));$offset=($page-1)*$perPage;
$status=trim((string)($_GET['status']??'open'));$severity=trim((string)($_GET['severity']??'all'));$category=trim((string)($_GET['category']??'all'));$query=trim((string)($_GET['q']??''));
$where=[];$params=[];
if(in_array($status,['open','resolved','ignored'],true)){$where[]='f.status=:status';$params[':status']=$status;}
if(in_array($severity,['info','low','medium','high','critical'],true)){$where[]='f.severity=:severity';$params[':severity']=$severity;}
if($category!==''&&$category!=='all'){$where[]='f.category=:category';$params[':category']=$category;}
if($query!==''){$where[]='(f.title LIKE :q OR f.case_key LIKE :q OR f.message LIKE :q OR f.root_cause LIKE :q OR f.remediation LIKE :q OR f.target_label LIKE :q)';$params[':q']='%'.$query.'%';}
$sqlWhere=$where?'WHERE '.implode(' AND ',$where):'';
try{
    $count=$pdo->prepare("SELECT COUNT(*) FROM qa_findings f {$sqlWhere}");$count->execute($params);$total=(int)$count->fetchColumn();
    $stmt=$pdo->prepare("SELECT f.*,u.name resolved_by_name FROM qa_findings f LEFT JOIN users u ON u.id=f.resolved_by {$sqlWhere} ORDER BY FIELD(f.status,'open','ignored','resolved'),FIELD(f.severity,'critical','high','medium','low','info'),f.last_seen_at DESC LIMIT {$perPage} OFFSET {$offset}");$stmt->execute($params);
    $rows=array_map(static function(array $row):array{$row['evidence']=$row['evidence_json']?json_decode($row['evidence_json'],true):null;unset($row['evidence_json']);return $row;},$stmt->fetchAll());
    $summary=$pdo->query("SELECT status,severity,COUNT(*) total FROM qa_findings GROUP BY status,severity")->fetchAll();
    $categories=$pdo->query("SELECT category,COUNT(*) total FROM qa_findings GROUP BY category ORDER BY category")->fetchAll();
    json_response(['success'=>true,'findings'=>$rows,'summary'=>$summary,'categories'=>$categories,'pagination'=>['page'=>$page,'per_page'=>$perPage,'total'=>$total,'pages'=>(int)ceil($total/$perPage)],'permissions'=>['can_export'=>admin_has_permission($user,'tests.export_findings'),'can_manage'=>admin_has_permission($user,'tests.manage_findings')]]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>'دریافت ایرادات تست ناموفق بود.','request_id'=>defined('APP_REQUEST_ID')?APP_REQUEST_ID:null],500);}
