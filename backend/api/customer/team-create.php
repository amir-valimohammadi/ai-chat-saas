<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/team-create.php
// هدف: ساخت پشتیبان جدید توسط Customer Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);

require_role($user, ['customer_admin']);
ensure_agent_limit($pdo, (int) $user['tenant_id']);

$input = get_json_input();

$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$phone = trim($input['phone'] ?? '');
$password = (string) ($input['password'] ?? '');
$siteIds = $input['site_ids'] ?? [];

if ($name === '') {
    json_response([
        'success' => false,
        'message' => 'Name is required'
    ], 422);
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response([
        'success' => false,
        'message' => 'Valid email is required'
    ], 422);
}

if (strlen($password) < 8) {
    json_response([
        'success' => false,
        'message' => 'Password must be at least 8 characters'
    ], 422);
}

if (!is_array($siteIds)) {
    $siteIds = [];
}

$siteIds = array_values(array_unique(array_map('intval', $siteIds)));

try {
    $planStmt = $pdo->prepare("
        SELECT plans.max_agents
        FROM tenants
        INNER JOIN plans ON plans.id = tenants.plan_id
        WHERE tenants.id = :tenant_id
        LIMIT 1
    ");

    $planStmt->execute([
        ':tenant_id' => $user['tenant_id']
    ]);

    $plan = $planStmt->fetch();

    if (!$plan) {
        json_response([
            'success' => false,
            'message' => 'Customer plan not found'
        ], 404);
    }

    $countStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM users
        WHERE tenant_id = :tenant_id
          AND role IN ('customer_admin', 'agent')
    ");

    $countStmt->execute([
        ':tenant_id' => $user['tenant_id']
    ]);

    $currentUsersCount = (int) $countStmt->fetch()['total'];
    $maxAgents = (int) $plan['max_agents'];

    if ($currentUsersCount >= $maxAgents) {
        json_response([
            'success' => false,
            'message' => 'Agent limit reached for this plan'
        ], 403);
    }

    $emailStmt = $pdo->prepare("
        SELECT id
        FROM users
        WHERE email = :email
        LIMIT 1
    ");

    $emailStmt->execute([
        ':email' => $email
    ]);

    if ($emailStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'A user with this email already exists'
        ], 409);
    }

    if (count($siteIds) === 0) {
        $sitesStmt = $pdo->prepare("
            SELECT id
            FROM sites
            WHERE tenant_id = :tenant_id
              AND is_active = 1
        ");

        $sitesStmt->execute([
            ':tenant_id' => $user['tenant_id']
        ]);

        $siteIds = array_map(function ($site) {
            return (int) $site['id'];
        }, $sitesStmt->fetchAll());
    } else {
        $placeholders = implode(',', array_fill(0, count($siteIds), '?'));

        $sitesStmt = $pdo->prepare("
            SELECT id
            FROM sites
            WHERE tenant_id = ?
              AND id IN ($placeholders)
              AND is_active = 1
        ");

        $sitesStmt->execute(array_merge([$user['tenant_id']], $siteIds));

        $validSiteIds = array_map(function ($site) {
            return (int) $site['id'];
        }, $sitesStmt->fetchAll());

        if (count($validSiteIds) !== count($siteIds)) {
            json_response([
                'success' => false,
                'message' => 'One or more selected sites are invalid'
            ], 422);
        }

        $siteIds = $validSiteIds;
    }

    if (count($siteIds) === 0) {
        json_response([
            'success' => false,
            'message' => 'No active site found for this customer'
        ], 422);
    }

    $pdo->beginTransaction();

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

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
        ':tenant_id' => $user['tenant_id'],
        ':name' => $name,
        ':email' => $email,
        ':phone' => $phone !== '' ? $phone : null,
        ':password_hash' => $passwordHash,
    ]);

    $newUserId = (int) $pdo->lastInsertId();

    $accessStmt = $pdo->prepare("
        INSERT INTO agent_site_access (
            user_id,
            site_id
        ) VALUES (
            :user_id,
            :site_id
        )
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
            'tenant_id' => $user['tenant_id'],
            'name' => $name,
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'role' => 'agent',
            'site_ids' => $siteIds,
        ]
    ], 201);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'success' => false,
        'message' => 'Failed to create agent',
        'error' => $e->getMessage()
    ], 500);
}