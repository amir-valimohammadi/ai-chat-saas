<?php

// مسیر فایل: backend/config/database.php
// هدف: اتصال PDO، ثبت مانیتورینگ درخواست و اعمال Maintenance Mode

require_once __DIR__ . '/app.php';
require_once __DIR__ . '/../includes/error-handler.php';

$host = getenv('DB_HOST') ?: 'localhost';
$dbname = getenv('DB_NAME') ?: 'ai_chat_saas';
$username = getenv('DB_USER') ?: 'root';
$password = getenv('DB_PASS') ?: '';

try {
    $pdo = new PDO(
        "mysql:host={$host};dbname={$dbname};charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    require_once __DIR__ . '/../includes/operations-monitor.php';
    operations_register_request_monitor($pdo);

    require_once __DIR__ . '/../includes/maintenance.php';
    enforce_maintenance_mode($pdo);
} catch (PDOException $e) {
    app_log_error($e, [
        'component' => 'database',
        'host' => $host,
        'database' => $dbname,
        'status_code' => 500,
    ]);

    if (function_exists('safe_json_error')) {
        safe_json_error('Database connection failed', 500, $e);
    }

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed',
    ]);
    exit;
}
