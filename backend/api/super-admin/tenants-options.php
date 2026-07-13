<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/tenants-options.php
// هدف: دریافت لیست مشتری‌ها برای انتخاب مخاطب اعلان‌ها

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

try {
    $stmt = $pdo->prepare("
        SELECT
            id,
            name,
            status,
            created_at
        FROM tenants
        ORDER BY id DESC
        LIMIT 500
    ");

    $stmt->execute();

    $tenants = $stmt->fetchAll();

    json_response([
        'success' => true,
        'tenants' => array_map(function ($tenant) {
            return [
                'id' => (int) $tenant['id'],
                'name' => $tenant['name'],
                'email' => null,
                'status' => $tenant['status'],
                'plan_name' => null,
                'created_at' => $tenant['created_at'],
            ];
        }, $tenants)
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load customers',
        'error' => $e->getMessage()
    ], 500);
}