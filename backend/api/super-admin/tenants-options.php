<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/tenants-options.php
// هدف: دریافت گزینه‌های مشتری برای فرم‌ها و انتخاب مخاطب

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

try {
    $stmt = $pdo->query("
        SELECT
            tenants.id,
            tenants.name,
            tenants.owner_email,
            tenants.status,
            tenants.created_at,
            plans.name AS plan_name
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        ORDER BY tenants.name ASC, tenants.id DESC
        LIMIT 500
    ");

    $tenants = array_map(static function (array $tenant): array {
        return [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'email' => $tenant['owner_email'],
            'status' => $tenant['status'],
            'plan_name' => $tenant['plan_name'],
            'created_at' => $tenant['created_at'],
        ];
    }, $stmt->fetchAll());

    json_response(['success' => true, 'tenants' => $tenants]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load customers',
        ...safe_api_exception_context($e),
    ], 500);
}
