<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/team-create.php
// هدف: ساخت امن Agent با کنترل اتمیک سقف پلن

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$input = get_json_input();

$name = trim((string) ($input['name'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
$phone = trim((string) ($input['phone'] ?? ''));
$password = (string) ($input['password'] ?? '');
$siteIds = $input['site_ids'] ?? [];

if ($name === '') {
    json_response(['success' => false, 'message' => 'Name is required'], 422);
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['success' => false, 'message' => 'Valid email is required'], 422);
}

if (mb_strlen($password, 'UTF-8') < 8) {
    json_response([
        'success' => false,
        'message' => 'Password must be at least 8 characters',
    ], 422);
}

if (!is_array($siteIds)) {
    $siteIds = [];
}

$siteIds = array_values(array_unique(array_filter(
    array_map('intval', $siteIds),
    static fn(int $id): bool => $id > 0
)));

$tenantId = (int) $user['tenant_id'];

try {
    if (count($siteIds) === 0) {
        $sitesStmt = $pdo->prepare("
            SELECT id
            FROM sites
            WHERE tenant_id = :tenant_id
              AND is_active = 1
            ORDER BY id ASC
        ");
        $sitesStmt->execute([':tenant_id' => $tenantId]);
        $siteIds = array_map(
            static fn(array $site): int => (int) $site['id'],
            $sitesStmt->fetchAll()
        );
    } else {
        $placeholders = implode(',', array_fill(0, count($siteIds), '?'));
        $sitesStmt = $pdo->prepare("
            SELECT id
            FROM sites
            WHERE tenant_id = ?
              AND id IN ({$placeholders})
              AND is_active = 1
        ");
        $sitesStmt->execute(array_merge([$tenantId], $siteIds));
        $validSiteIds = array_map(
            static fn(array $site): int => (int) $site['id'],
            $sitesStmt->fetchAll()
        );
        sort($siteIds);
        sort($validSiteIds);

        if ($validSiteIds !== $siteIds) {
            json_response([
                'success' => false,
                'message' => 'One or more selected sites are invalid',
            ], 422);
        }
    }

    if (count($siteIds) === 0) {
        json_response([
            'success' => false,
            'message' => 'No active site found for this customer',
        ], 422);
    }

    $pdo->beginTransaction();

    ensure_agent_limit($pdo, $tenantId, true);

    $emailStmt = $pdo->prepare("
        SELECT id
        FROM users
        WHERE email = :email
        LIMIT 1
        FOR UPDATE
    ");
    $emailStmt->execute([':email' => $email]);

    if ($emailStmt->fetch()) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'A user with this email already exists',
        ], 409);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    if ($passwordHash === false) {
        throw new RuntimeException('Password hashing failed');
    }

    $userStmt = $pdo->prepare("
        INSERT INTO users (
            tenant_id,
            name,
            email,
            phone,
            password_hash,
            role,
            is_active
        ) VALUES (
            :tenant_id,
            :name,
            :email,
            :phone,
            :password_hash,
            'agent',
            1
        )
    ");

    $userStmt->execute([
        ':tenant_id' => $tenantId,
        ':name' => $name,
        ':email' => $email,
        ':phone' => $phone !== '' ? $phone : null,
        ':password_hash' => $passwordHash,
    ]);

    $newUserId = (int) $pdo->lastInsertId();

    $accessStmt = $pdo->prepare("
        INSERT INTO agent_site_access (user_id, site_id)
        VALUES (:user_id, :site_id)
    ");

    foreach ($siteIds as $siteId) {
        $accessStmt->execute([
            ':user_id' => $newUserId,
            ':site_id' => $siteId,
        ]);
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Agent created successfully',
        'agent' => [
            'id' => $newUserId,
            'tenant_id' => $tenantId,
            'name' => $name,
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'role' => 'agent',
            'site_ids' => $siteIds,
        ],
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'Failed to create agent',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
