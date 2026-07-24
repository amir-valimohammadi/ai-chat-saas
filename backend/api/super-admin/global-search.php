<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';
require_once __DIR__.'/../../includes/response.php';
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/auth.php';

if($_SERVER['REQUEST_METHOD']!=='GET')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);
$q=trim((string)($_GET['q']??''));
$scope=(string)($_GET['scope']??'all');
$allowed=['all','customers','sites','users','conversations'];
if((function_exists('mb_strlen') ? mb_strlen($q, 'UTF-8') : strlen($q))<2||(function_exists('mb_strlen') ? mb_strlen($q, 'UTF-8') : strlen($q))>100)json_response(['success'=>false,'message'=>'عبارت جست‌وجو باید بین ۲ تا ۱۰۰ نویسه باشد.'],422);
if(!in_array($scope,$allowed,true))$scope='all';
$like='%'.$q.'%';

try{
    $groups=[];
    if($scope==='all'||$scope==='customers'){
        $s=$pdo->prepare("SELECT t.id,t.name,t.owner_name,t.owner_email,t.owner_phone,t.status,t.lifecycle_stage,p.name plan_name FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.name LIKE ? OR t.owner_name LIKE ? OR t.owner_email LIKE ? OR t.owner_phone LIKE ? ORDER BY t.updated_at DESC,t.id DESC LIMIT 12");
        $s->execute(array_fill(0,4,$like));
        $groups['customers']=array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['name'],'subtitle'=>trim(($r['owner_name']??'').' · '.($r['owner_email']??''),' ·'),'meta'=>['status'=>$r['status'],'stage'=>$r['lifecycle_stage'],'plan'=>$r['plan_name']],'href'=>'/super-admin/customers/'.$r['id']],$s->fetchAll());
    }
    if($scope==='all'||$scope==='sites'){
        $s=$pdo->prepare("SELECT s.id,s.name,s.domain,s.site_key,s.is_active,t.id tenant_id,t.name tenant_name FROM sites s INNER JOIN tenants t ON t.id=s.tenant_id WHERE s.name LIKE ? OR s.domain LIKE ? OR s.site_key LIKE ? OR t.name LIKE ? ORDER BY s.updated_at DESC,s.id DESC LIMIT 12");
        $s->execute(array_fill(0,4,$like));
        $groups['sites']=array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['name'],'subtitle'=>$r['domain'],'meta'=>['tenant_id'=>(int)$r['tenant_id'],'tenant_name'=>$r['tenant_name'],'active'=>(bool)$r['is_active'],'site_key'=>$r['site_key']],'href'=>'/super-admin/customers/'.$r['tenant_id'].'?tab=sites'],$s->fetchAll());
    }
    if($scope==='all'||$scope==='users'){
        $s=$pdo->prepare("SELECT u.id,u.name,u.email,u.phone,u.role,u.is_active,u.tenant_id,t.name tenant_name FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE u.role IN ('customer_admin','agent') AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR t.name LIKE ?) ORDER BY u.last_seen_at DESC,u.id DESC LIMIT 12");
        $s->execute(array_fill(0,4,$like));
        $groups['users']=array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['name'],'subtitle'=>$r['email'],'meta'=>['role'=>$r['role'],'active'=>(bool)$r['is_active'],'tenant_id'=>(int)$r['tenant_id'],'tenant_name'=>$r['tenant_name']],'href'=>'/super-admin/customers/'.$r['tenant_id'].'?tab=users'],$s->fetchAll());
    }
    if($scope==='all'||$scope==='conversations'){
        $s=$pdo->prepare("SELECT c.id,c.status,c.source_page_title,c.source_page_url,c.last_message_at,s.id site_id,s.name site_name,t.id tenant_id,t.name tenant_name,v.name visitor_name,v.email visitor_email,v.phone visitor_phone FROM conversations c INNER JOIN sites s ON s.id=c.site_id INNER JOIN tenants t ON t.id=s.tenant_id INNER JOIN visitors v ON v.id=c.visitor_id WHERE CAST(c.id AS CHAR) LIKE ? OR v.name LIKE ? OR v.email LIKE ? OR v.phone LIKE ? OR c.source_page_title LIKE ? OR c.source_page_url LIKE ? ORDER BY COALESCE(c.last_message_at,c.created_at) DESC LIMIT 12");
        $s->execute(array_fill(0,6,$like));
        $groups['conversations']=array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>'گفتگو #'.$r['id'].' · '.($r['visitor_name']?:'بازدیدکننده'),'subtitle'=>$r['site_name'].' · '.$r['tenant_name'],'meta'=>['status'=>$r['status'],'tenant_id'=>(int)$r['tenant_id'],'site_id'=>(int)$r['site_id'],'last_message_at'=>$r['last_message_at']],'href'=>'/super-admin/customers/'.$r['tenant_id'].'?tab=activity&conversation='.$r['id']],$s->fetchAll());
    }
    $total=array_sum(array_map('count',$groups));
    json_response(['success'=>true,'query'=>$q,'scope'=>$scope,'total'=>$total,'groups'=>$groups]);
}catch(Throwable $e){
    error_log('[GLOBAL_SEARCH] '.$e->getMessage());
    json_response(['success'=>false,'message'=>'جست‌وجوی سراسری ناموفق بود.'],500);
}
