<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

require_auth($pdo);
$impersonation = auth_request_uses_impersonation();
json_response([
    'success' => true,
    'csrf_token' => auth_ensure_csrf_token($impersonation),
    'auth_context' => $impersonation ? 'impersonation' : 'primary',
]);
