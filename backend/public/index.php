<?php

declare(strict_types=1);

require_once __DIR__ . '/../includes/error-handler.php';
require_once __DIR__ . '/../includes/response.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

json_response([
    'success' => true,
    'status' => 'ok',
    'message' => 'AI Chat SaaS backend is running',
]);
