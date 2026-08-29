<?php

declare(strict_types=1);
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/qa-browser.php';
if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$input=get_json_input();$runId=(int)($input['run_id']??0);$token=(string)($input['token']??'');
try{$run=qa_browser_validate_worker($pdo,$runId,$token);json_response(['success'=>true,'cancel_requested'=>!empty($run['cancel_requested_at']),'status'=>$run['status']]);}
catch(Throwable $e){json_response(['success'=>false,'message'=>safe_api_exception_message($e,'QA worker request rejected.')],403);}
