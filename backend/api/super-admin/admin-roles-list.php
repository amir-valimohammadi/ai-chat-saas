<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';
require_once __DIR__.'/../../includes/response.php';
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/auth.php';
if($_SERVER['REQUEST_METHOD']!=='GET')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);
$permissions=$pdo->query("SELECT id,code,name,group_name,description FROM admin_permissions ORDER BY group_name,name")->fetchAll();
$roles=$pdo->query("SELECT r.id,r.code,r.name,r.description,r.is_system,r.is_active,r.created_at,r.updated_at,COUNT(DISTINCT u.id) admins_count FROM admin_roles r LEFT JOIN users u ON u.admin_role_id=r.id AND u.role='super_admin' GROUP BY r.id ORDER BY (r.code='owner') DESC,r.is_system DESC,r.name")->fetchAll();
$stmt=$pdo->prepare("SELECT p.code FROM admin_role_permissions rp INNER JOIN admin_permissions p ON p.id=rp.permission_id WHERE rp.role_id=:id ORDER BY p.code");
foreach($roles as &$role){$stmt->execute([':id'=>(int)$role['id']]);$role['permissions']=array_column($stmt->fetchAll(),'code');if($role['code']==='owner')$role['permissions']=['*'];}
unset($role);
json_response(['success'=>true,'roles'=>$roles,'permissions'=>$permissions,'current_admin'=>['is_owner'=>!empty($user['is_platform_owner'])]]);
