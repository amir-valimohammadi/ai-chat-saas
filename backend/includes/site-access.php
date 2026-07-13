<?php

// مسیر فایل: ai-chat-saas/backend/includes/site-access.php
// هدف: بررسی اینکه کاربر لاگین‌شده به یک site_id دسترسی دارد یا نه

require_once __DIR__ . '/response.php';

function user_can_access_site(PDO $pdo, array $user, int $siteId): bool
{
    if ($user['role'] === 'super_admin') {
        return true;
    }

    if ($user['role'] === 'customer_admin') {
        $stmt = $pdo->prepare("
            SELECT id
            FROM sites
            WHERE id = :site_id
              AND tenant_id = :tenant_id
            LIMIT 1
        ");

        $stmt->execute([
            ':site_id' => $siteId,
            ':tenant_id' => $user['tenant_id'],
        ]);

        return (bool) $stmt->fetch();
    }

    if ($user['role'] === 'agent') {
        $stmt = $pdo->prepare("
            SELECT sites.id
            FROM sites
            INNER JOIN agent_site_access 
                ON agent_site_access.site_id = sites.id
            WHERE sites.id = :site_id
              AND sites.tenant_id = :tenant_id
              AND agent_site_access.user_id = :user_id
            LIMIT 1
        ");

        $stmt->execute([
            ':site_id' => $siteId,
            ':tenant_id' => $user['tenant_id'],
            ':user_id' => $user['id'],
        ]);

        return (bool) $stmt->fetch();
    }

    return false;
}

function require_site_access(PDO $pdo, array $user, int $siteId): void
{
    if (!user_can_access_site($pdo, $user, $siteId)) {
        json_response([
            'success' => false,
            'message' => 'You do not have access to this site'
        ], 403);
    }
}