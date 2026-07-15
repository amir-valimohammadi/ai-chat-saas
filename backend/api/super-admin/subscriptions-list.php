<?php
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/subscription.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo); require_role($user,['super_admin']);
$search=trim((string)($_GET['search']??'')); $status=trim((string)($_GET['status']??''));
$allowed=['trial','active','past_due','expired','cancelled','suspended'];
$where=[]; $params=[];
if($search!==''){ $where[]='(t.name LIKE :search OR t.owner_email LIKE :search)'; $params[':search']='%'.$search.'%'; }
if(in_array($status,$allowed,true)){ $where[]='s.status = :status'; $params[':status']=$status; }
$sql="SELECT s.*,t.name tenant_name,t.owner_email,t.status tenant_status,p.name plan_name,
      (SELECT MAX(sp.paid_at) FROM subscription_payments sp WHERE sp.subscription_id=s.id AND sp.status='paid') last_paid_at
      FROM tenant_subscriptions s JOIN tenants t ON t.id=s.tenant_id JOIN plans p ON p.id=s.plan_id".
      ($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY s.ends_at ASC,s.id DESC LIMIT 500";
$stmt=$pdo->prepare($sql); $stmt->execute($params); $items=[]; $summary=array_fill_keys($allowed,0);
foreach($stmt->fetchAll() as $row){$row['calculated_status']=calculate_subscription_status($row);$row['days_remaining']=max(0,(int)floor((strtotime($row['ends_at'])-time())/86400));$summary[$row['calculated_status']]++;$items[]=array_merge(subscription_public_data($row),['tenant_name'=>$row['tenant_name'],'owner_email'=>$row['owner_email'],'tenant_status'=>$row['tenant_status'],'last_paid_at'=>$row['last_paid_at']]);}
json_response(['success'=>true,'subscriptions'=>$items,'summary'=>$summary,'generated_at'=>date('Y-m-d H:i:s')]);

