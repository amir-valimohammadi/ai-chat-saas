<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/auth-session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}
$user = require_auth($pdo);

try {
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE users SET token_version=token_version+1 WHERE id=:id')
        ->execute([':id' => (int) $user['id']]);
    auth_revoke_sessions($pdo, (int) $user['id'], (int) $user['id'], 'Logout from all devices');
    $pdo->commit();
    auth_clear_session_cookies(auth_request_uses_impersonation());
    json_response(['success' => true, 'message' => 'تمام نشست‌ها باطل شدند.']);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response(['success' => false, 'message' => 'خروج از همه دستگاه‌ها ناموفق بود.'], 500);
}
