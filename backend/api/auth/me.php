<?php

declare(strict_types=1);
require_once __DIR__.'/../../includes/cors.php';require_once __DIR__.'/../../includes/response.php';require_once __DIR__.'/../../config/database.php';require_once __DIR__.'/../../includes/auth.php';
if($_SERVER['REQUEST_METHOD']!=='GET')json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo);unset($user['session_jti']);json_response(['success'=>true,'user'=>$user]);
