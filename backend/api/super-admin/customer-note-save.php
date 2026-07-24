<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';require_once __DIR__.'/../../includes/response.php';require_once __DIR__.'/../../includes/helpers.php';require_once __DIR__.'/../../config/database.php';require_once __DIR__.'/../../includes/auth.php';require_once __DIR__.'/../../includes/admin-audit.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);$input=get_json_input();
$tenantId=filter_var($input['tenant_id']??0,FILTER_VALIDATE_INT,['options'=>['default'=>0,'min_range'=>1]]);$noteId=filter_var($input['note_id']??0,FILTER_VALIDATE_INT,['options'=>['default'=>0,'min_range'=>1]]);$body=trim((string)($input['body']??''));$pinned=!empty($input['is_pinned']);
if($tenantId<=0||$body===''||(function_exists('mb_strlen') ? mb_strlen($body, 'UTF-8') : strlen($body))>5000)json_response(['success'=>false,'message'=>'متن یادداشت باید بین ۱ تا ۵۰۰۰ نویسه باشد.'],422);
try{
 $t=$pdo->prepare('SELECT name FROM tenants WHERE id=:id');$t->execute([':id'=>$tenantId]);$tenantName=$t->fetchColumn();if(!$tenantName)json_response(['success'=>false,'message'=>'مشتری پیدا نشد.'],404);
 if($noteId>0){$n=$pdo->prepare('SELECT id,body,is_pinned FROM tenant_notes WHERE id=:id AND tenant_id=:tenant_id LIMIT 1');$n->execute([':id'=>$noteId,':tenant_id'=>$tenantId]);$old=$n->fetch();if(!$old)json_response(['success'=>false,'message'=>'یادداشت پیدا نشد.'],404);$pdo->prepare('UPDATE tenant_notes SET body=:body,is_pinned=:pinned WHERE id=:id')->execute([':body'=>$body,':pinned'=>$pinned?1:0,':id'=>$noteId]);$action='customer.note_updated';$description='یادداشت داخلی مشتری «'.$tenantName.'» ویرایش شد.';$oldValues=['body'=>$old['body'],'is_pinned'=>(bool)$old['is_pinned']];}
 else{$pdo->prepare('INSERT INTO tenant_notes(tenant_id,author_user_id,body,is_pinned) VALUES(:tenant_id,:author,:body,:pinned)')->execute([':tenant_id'=>$tenantId,':author'=>(int)$user['id'],':body'=>$body,':pinned'=>$pinned?1:0]);$noteId=(int)$pdo->lastInsertId();$action='customer.note_created';$description='یادداشت داخلی برای مشتری «'.$tenantName.'» ثبت شد.';$oldValues=null;}
 admin_audit_log($pdo,$user,$action,'tenant_note',$noteId,$description,$oldValues,['body'=>$body,'is_pinned'=>$pinned],['tenant_id'=>$tenantId]);
 json_response(['success'=>true,'message'=>'یادداشت ذخیره شد.','note_id'=>$noteId]);
}catch(Throwable $e){error_log('[CUSTOMER_NOTE_SAVE] '.$e->getMessage());json_response(['success'=>false,'message'=>'ذخیره یادداشت ناموفق بود.'],500);}
