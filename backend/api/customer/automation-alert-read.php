<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$alertId = max(0, (int) ($input['alert_id'] ?? 0));

try {
    if ($alertId > 0) {
        $stmt = $pdo->prepare("
            UPDATE automation_alerts SET is_read = 1, read_at = COALESCE(read_at, NOW())
            WHERE id = :id AND tenant_id = :tenant_id
              AND (recipient_user_id IS NULL OR recipient_user_id = :recipient_user_id)
        ");
        $stmt->execute([':id' => $alertId, ':tenant_id' => (int) $user['tenant_id'], ':recipient_user_id' => (int) $user['id']]);
    } else {
        $stmt = $pdo->prepare("
            UPDATE automation_alerts SET is_read = 1, read_at = COALESCE(read_at, NOW())
            WHERE tenant_id = :tenant_id
              AND (recipient_user_id IS NULL OR recipient_user_id = :recipient_user_id)
        ");
        $stmt->execute([':tenant_id' => (int) $user['tenant_id'], ':recipient_user_id' => (int) $user['id']]);
    }
    json_response(['success' => true, 'message' => 'هشدارها خوانده شدند.']);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'به‌روزرسانی هشدار ناموفق بود.'], 500);
}

