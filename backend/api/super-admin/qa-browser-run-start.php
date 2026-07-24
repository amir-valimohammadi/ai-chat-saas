<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../includes/qa-browser.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);require_admin_permission($user,'tests.run_browser');
$input=get_json_input();$runId=(int)($input['run_id']??0);if($runId<1)json_response(['success'=>false,'message'=>'شناسه اجرا معتبر نیست.'],422);
$stmt=$pdo->prepare("SELECT id,status,profile,worker_token_expires_at FROM qa_test_runs WHERE id=:id LIMIT 1");$stmt->execute([':id'=>$runId]);$run=$stmt->fetch();
if(!$run||$run['profile']!=='browser')json_response(['success'=>false,'message'=>'اجرای مرورگری پیدا نشد.'],404);
if($run['status']!=='queued')json_response(['success'=>false,'message'=>'فقط اجرای در صف قابل شروع مجدد است.'],409);
if(!$run['worker_token_expires_at']||strtotime((string)$run['worker_token_expires_at'])<=time())qa_browser_create_worker_token($pdo,$runId);
$spawn=qa_browser_spawn_worker($runId);admin_audit_log($pdo,$user,'qa_browser_worker_started','qa_test_run',$runId,'شروع Worker مرورگری درخواست شد.',null,$spawn);
json_response(['success'=>$spawn['started'],'message'=>$spawn['message'],'worker'=>$spawn],$spawn['started']?200:503);
