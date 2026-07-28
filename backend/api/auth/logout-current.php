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
$stmt = $pdo->prepare("\n    UPDATE auth_sessions SET revoked_at=NOW(),revoked_by=:revoked_by,revocation_reason='User logout'\n    WHERE user_id=:session_user_id AND jti_hash=:jti_hash AND revoked_at IS NULL\n");
$stmt->execute([
    ':revoked_by' => (int) $user['id'],
    ':session_user_id' => (int) $user['id'],
    ':jti_hash' => hash('sha256', (string) $user['session_jti']),
]);
json_response(['success' => true, 'message' => 'از حساب خارج شدید.']);
