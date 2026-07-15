<?php
require_once __DIR__ . '/../../includes/cors.php'; require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php'; require_once __DIR__ . '/../../includes/auth.php'; require_once __DIR__ . '/../../includes/subscription.php';
if($_SERVER['REQUEST_METHOD']!=='GET')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);$id=filter_var($_GET['id']??0,FILTER_VALIDATE_INT);
if(!$id)json_response(['success'=>false,'message'=>'id is required'],422);
$q=$pdo->prepare("SELECT s.*,t.name tenant_name,t.owner_email,t.status tenant_status,p.name plan_name,p.description plan_description FROM tenant_subscriptions s JOIN tenants t ON t.id=s.tenant_id JOIN plans p ON p.id=s.plan_id WHERE s.id=:id");$q->execute([':id'=>$id]);$s=$q->fetch();if(!$s)json_response(['success'=>false,'message'=>'Subscription not found'],404);
$s['calculated_status']=calculate_subscription_status($s);$s['days_remaining']=max(0,(int)floor((strtotime($s['ends_at'])-time())/86400));
$p=$pdo->prepare("SELECT sp.*,u.name created_by_name FROM subscription_payments sp LEFT JOIN users u ON u.id=sp.created_by WHERE sp.subscription_id=:id ORDER BY sp.id DESC");$p->execute([':id'=>$id]);
$h=$pdo->prepare("SELECT s.id,s.plan_id,p.name plan_name,s.status,s.billing_cycle,s.starts_at,s.ends_at,s.price,s.currency,s.created_at FROM tenant_subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=:tenant ORDER BY s.id DESC");$h->execute([':tenant'=>$s['tenant_id']]);
json_response(['success'=>true,'subscription'=>array_merge(subscription_public_data($s),['tenant_name'=>$s['tenant_name'],'owner_email'=>$s['owner_email'],'tenant_status'=>$s['tenant_status'],'plan_description'=>$s['plan_description']]),'payments'=>$p->fetchAll(),'history'=>$h->fetchAll()]);

