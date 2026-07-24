<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
if($_SERVER['REQUEST_METHOD']!=='GET') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo); require_role($user,['super_admin']);
$id=max(0,(int)($_GET['id']??0)); if($id<1) json_response(['success'=>false,'message'=>'شناسه اجرا معتبر نیست.'],422);
try{
    $stmt=$pdo->prepare('SELECT * FROM qa_test_runs WHERE id=:id LIMIT 1');$stmt->execute([':id'=>$id]);$run=$stmt->fetch();if(!$run)json_response(['success'=>false,'message'=>'اجرای تست پیدا نشد.'],404);
    $itemsStmt=$pdo->prepare("SELECT id,case_key,category,title,description,status,severity,duration_ms,message,root_cause,impact,expected_value,actual_value,remediation,details_json,evidence_json,created_at FROM qa_test_run_items WHERE run_id=:id ORDER BY FIELD(status,'failed','error','warning','passed','skipped'), FIELD(severity,'critical','high','medium','low','info'), category,title");$itemsStmt->execute([':id'=>$id]);
    $items=array_map(static function(array $row):array{$row['details']=$row['details_json']?json_decode($row['details_json'],true):null;$row['evidence']=$row['evidence_json']?json_decode($row['evidence_json'],true):null;if(empty($row['root_cause'])&&in_array($row['status'],['warning','failed','error'],true))$row['root_cause']=$row['message'];if(empty($row['impact']))$row['impact']=match($row['severity']){'critical'=>'احتمال توقف سرویس، نشت داده یا شکست امنیتی جدی وجود دارد.','high'=>'ممکن است قابلیت اصلی سامانه یا امنیت کاربران مختل شود.','medium'=>'بخشی از رفتار سامانه می‌تواند ناپایدار یا ناقص باشد.','low'=>'ریسک محدود یا مشکل نگهداری وجود دارد.',default=>null};unset($row['details_json'],$row['evidence_json']);return $row;},$itemsStmt->fetchAll());
    json_response(['success'=>true,'run'=>$run,'items'=>$items]);
}catch(Throwable $e){json_response(['success'=>false,'message'=>'دریافت نتیجه تست ناموفق بود.','error'=>$e->getMessage()],500);}
