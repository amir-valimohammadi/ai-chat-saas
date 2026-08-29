<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/qa-browser.php';
if($_SERVER['REQUEST_METHOD']!=='GET')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);require_admin_permission($user,'tests.view_artifacts');
$id=max(0,(int)($_GET['id']??0));if($id<1)json_response(['success'=>false,'message'=>'شناسه فایل معتبر نیست.'],422);
$stmt=$pdo->prepare('SELECT * FROM qa_test_artifacts WHERE id=:id LIMIT 1');$stmt->execute([':id'=>$id]);$artifact=$stmt->fetch();if(!$artifact)json_response(['success'=>false,'message'=>'فایل تست پیدا نشد.'],404);
$root=realpath(qa_browser_artifact_root());$file=realpath(qa_browser_artifact_root().'/'.ltrim((string)$artifact['storage_path'],'/'));
if(!$root||!$file||!str_starts_with(str_replace('\\','/',$file),str_replace('\\','/',$root).'/')||!is_file($file))json_response(['success'=>false,'message'=>'فایل خروجی در Storage موجود نیست.'],404);
$activeTypes=['text/html','image/svg+xml','application/javascript','text/javascript','application/xml','text/xml'];
$mimeType=(string)($artifact['mime_type']?:'application/octet-stream');
if(in_array(strtolower($mimeType),$activeTypes,true))$mimeType='application/octet-stream';
$downloadName=preg_replace('/[\x00-\x1F\x7F"\\\\]+/','_',basename((string)$artifact['display_name']))?:'qa-artifact';
header('Content-Type: '.$mimeType);
header('Content-Length: '.filesize($file));
header('Content-Disposition: attachment; filename="'.$downloadName.'"');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; sandbox");
readfile($file);exit;
