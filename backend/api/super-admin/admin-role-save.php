<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';
require_once __DIR__.'/../../includes/response.php';
require_once __DIR__.'/../../includes/helpers.php';
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/admin-audit.php';
require_once __DIR__.'/../../includes/admin-access.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$actor=require_auth($pdo);require_role($actor,['super_admin']);$in=get_json_input();require_sensitive_confirmation($pdo,$actor,$in);
$id=(int)($in['id']??0);$name=trim((string)($in['name']??''));$description=trim((string)($in['description']??''));$codes=$in['permissions']??[];
if($name===''||mb_strlen($name)>190||!is_array($codes))json_response(['success'=>false,'message'=>'نام و مجوزهای نقش معتبر نیست.'],422);
$codes=array_values(array_unique(array_filter(array_map('strval',$codes))));
if(!$codes)json_response(['success'=>false,'message'=>'حداقل یک مجوز انتخاب کنید.'],422);
try{$pdo->beginTransaction();
$placeholders=implode(',',array_fill(0,count($codes),'?'));$q=$pdo->prepare("SELECT id,code FROM admin_permissions WHERE code IN ($placeholders)");$q->execute($codes);$valid=$q->fetchAll();if(count($valid)!==count($codes))throw new RuntimeException('یک یا چند مجوز نامعتبر است.');
if($id===0){$base=preg_replace('/[^a-z0-9]+/','-',strtolower(trim((string)($in['code']??''))));$base=trim($base,'-');if($base===''||strlen($base)>70)throw new RuntimeException('کد انگلیسی نقش معتبر نیست.');$exists=$pdo->prepare('SELECT COUNT(*) FROM admin_roles WHERE code=:code');$exists->execute([':code'=>$base]);if((int)$exists->fetchColumn()>0)throw new RuntimeException('کد نقش تکراری است.');
$pdo->prepare('INSERT INTO admin_roles(code,name,description,is_system,is_active,created_by,created_at) VALUES(:code,:name,:description,0,1,:created_by,NOW())')->execute([':code'=>$base,':name'=>$name,':description'=>$description!==''?$description:null,':created_by'=>$actor['id']]);$id=(int)$pdo->lastInsertId();$old=null;
}else{$oldStmt=$pdo->prepare('SELECT id,code,name,description,is_system,is_active FROM admin_roles WHERE id=:id LIMIT 1 FOR UPDATE');$oldStmt->execute([':id'=>$id]);$old=$oldStmt->fetch();if(!$old)throw new RuntimeException('نقش پیدا نشد.');if($old['code']==='owner')throw new RuntimeException('مجوزهای نقش مالک قابل تغییر نیست.');if((int)$old['is_system']===1&&!$actor['is_platform_owner'])throw new RuntimeException('فقط مالک پلتفرم می‌تواند نقش سیستمی را تغییر دهد.');$pdo->prepare('UPDATE admin_roles SET name=:name,description=:description,updated_at=NOW() WHERE id=:id')->execute([':name'=>$name,':description'=>$description!==''?$description:null,':id'=>$id]);}
$pdo->prepare('DELETE FROM admin_role_permissions WHERE role_id=:id')->execute([':id'=>$id]);$ins=$pdo->prepare('INSERT INTO admin_role_permissions(role_id,permission_id) VALUES(:role_id,:permission_id)');foreach($valid as $permission)$ins->execute([':role_id'=>$id,':permission_id'=>(int)$permission['id']]);
admin_audit_log($pdo,$actor,$old?'admin_role.updated':'admin_role.created','admin_role',$id,$old?'نقش مدیریتی ویرایش شد':'نقش مدیریتی ایجاد شد',$old,['name'=>$name,'description'=>$description,'permissions'=>$codes]);$pdo->commit();json_response(['success'=>true,'message'=>'نقش مدیریتی ذخیره شد.','role_id'=>$id]);
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();json_response(['success'=>false,'message'=>$e->getMessage()],422);}
