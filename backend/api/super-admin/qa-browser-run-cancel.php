<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);require_role($user,['super_admin']);require_admin_permission($user,'tests.cancel_runs');
$input=get_json_input();$runId=(int)($input['run_id']??0);if($runId<1)json_response(['success'=>false,'message'=>'شناسه اجرا معتبر نیست.'],422);
$stmt=$pdo->prepare("UPDATE qa_test_runs SET cancel_requested_at=NOW() WHERE id=:id AND profile='browser' AND status IN ('queued','running')");$stmt->execute([':id'=>$runId]);
if($stmt->rowCount()<1)json_response(['success'=>false,'message'=>'این اجرا قابل لغو نیست.'],409);
admin_audit_log($pdo,$user,'qa_browser_run_cancel_requested','qa_test_run',$runId,'درخواست لغو تست مرورگری ثبت شد.');
json_response(['success'=>true,'message'=>'درخواست لغو ثبت شد.']);
