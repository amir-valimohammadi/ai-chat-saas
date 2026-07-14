<?php

// مسیر فایل: ai-chat-saas/backend/includes/admin-audit.php
// هدف: ثبت امن رویدادهای مدیریتی بدون ذخیره رمز، Token یا Secret

declare(strict_types=1);

function admin_audit_sanitize($value)
{
    if (!is_array($value)) {
        return $value;
    }

    $sensitive = [
        'password', 'password_hash', 'new_password', 'token', 'access_token',
        'refresh_token', 'jwt', 'jwt_secret', 'secret', 'api_key',
        'authorization', 'cookie',
    ];

    $clean = [];

    foreach ($value as $key => $item) {
        if (in_array(strtolower((string) $key), $sensitive, true)) {
            $clean[$key] = '[REDACTED]';
            continue;
        }

        $clean[$key] = admin_audit_sanitize($item);
    }

    return $clean;
}

function admin_audit_encode(?array $value): ?string
{
    if ($value === null || $value === []) {
        return null;
    }

    $json = json_encode(
        admin_audit_sanitize($value),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    if ($json === false) {
        throw new RuntimeException('Failed to encode audit payload');
    }

    return $json;
}

function admin_audit_log(
    PDO $pdo,
    array $actor,
    string $action,
    string $entityType,
    ?int $entityId,
    string $description,
    ?array $oldValues = null,
    ?array $newValues = null,
    array $context = []
): int {
    $description = trim($description);

    if ($action === '' || strlen($action) > 100) {
        throw new InvalidArgumentException('Invalid audit action');
    }

    if ($entityType === '' || strlen($entityType) > 50) {
        throw new InvalidArgumentException('Invalid audit entity type');
    }

    if ($description === '') {
        throw new InvalidArgumentException('Audit description is required');
    }

    $description = function_exists('mb_substr')
        ? mb_substr($description, 0, 500, 'UTF-8')
        : substr($description, 0, 500);

    $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    $userAgent = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));

    $stmt = $pdo->prepare("\n        INSERT INTO admin_audit_logs (\n            actor_user_id, actor_name, actor_email, actor_role,\n            action, entity_type, entity_id, tenant_id, site_id,\n            target_user_id, plan_id, description, old_values_json,\n            new_values_json, ip_address, user_agent\n        ) VALUES (\n            :actor_user_id, :actor_name, :actor_email, :actor_role,\n            :action, :entity_type, :entity_id, :tenant_id, :site_id,\n            :target_user_id, :plan_id, :description, :old_values_json,\n            :new_values_json, :ip_address, :user_agent\n        )\n    ");

    $stmt->execute([
        ':actor_user_id' => isset($actor['id']) ? (int) $actor['id'] : null,
        ':actor_name' => $actor['name'] ?? null,
        ':actor_email' => $actor['email'] ?? null,
        ':actor_role' => $actor['role'] ?? null,
        ':action' => $action,
        ':entity_type' => $entityType,
        ':entity_id' => $entityId,
        ':tenant_id' => isset($context['tenant_id']) ? (int) $context['tenant_id'] : null,
        ':site_id' => isset($context['site_id']) ? (int) $context['site_id'] : null,
        ':target_user_id' => isset($context['target_user_id']) ? (int) $context['target_user_id'] : null,
        ':plan_id' => isset($context['plan_id']) ? (int) $context['plan_id'] : null,
        ':description' => $description,
        ':old_values_json' => admin_audit_encode($oldValues),
        ':new_values_json' => admin_audit_encode($newValues),
        ':ip_address' => $ip !== '' ? substr($ip, 0, 45) : null,
        ':user_agent' => $userAgent !== '' ? substr($userAgent, 0, 500) : null,
    ]);

    return (int) $pdo->lastInsertId();
}
