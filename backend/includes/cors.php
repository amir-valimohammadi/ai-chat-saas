<?php

// مسیر فایل: ai-chat-saas/backend/includes/cors.php
// هدف: تنظیم CORS امن برای ارتباط پنل Next.js با PHP API

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/security-headers.php';

send_common_security_headers('api');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOriginsRaw = (string) app_env(
    'PANEL_ALLOWED_ORIGINS',
    app_env('FRONTEND_URL', 'http://localhost:3000')
);

$allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $allowedOriginsRaw))));

if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
} elseif (!app_is_production()) {
    header('Access-Control-Allow-Origin: http://localhost:3000');
    header('Vary: Origin');
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if ($origin !== '' && app_is_production() && !in_array($origin, $allowedOrigins, true)) {
        http_response_code(403);
        exit;
    }

    http_response_code(204);
    exit;
}