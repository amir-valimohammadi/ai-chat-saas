<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/routing.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$tenantId = (int) $user['tenant_id'];
$departmentId = isset($input['department_id']) ? (int) $input['department_id'] : 0;
$isNewDepartment = $departmentId <= 0;
$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;
$name = trim((string) ($input['name'] ?? ''));
$description = trim((string) ($input['description'] ?? ''));
$color = trim((string) ($input['color'] ?? '#2563eb'));
$strategy = trim((string) ($input['routing_strategy'] ?? 'round_robin'));
$queueEnabled = !empty($input['queue_enabled']) ? 1 : 0;
$queueMessage = trim((string) ($input['queue_message'] ?? ''));
$isDefault = !empty($input['is_default']) ? 1 : 0;
$isActive = array_key_exists('is_active', $input) ? (!empty($input['is_active']) ? 1 : 0) : 1;

if ($siteId <= 0 || $name === '') json_response(['success' => false, 'message' => 'site_id and name are required'], 422);
if (mb_strlen($name, 'UTF-8') > 120 || mb_strlen($description, 'UTF-8') > 500 || mb_strlen($queueMessage, 'UTF-8') > 500) {
    json_response(['success' => false, 'message' => 'Department data is too long'], 422);
}
if (!preg_match('/^#[0-9a-f]{6}$/i', $color)) $color = '#2563eb';
if (!in_array($strategy, routing_allowed_strategies(), true)) json_response(['success' => false, 'message' => 'Invalid routing strategy'], 422);

try {
    $siteStmt = $pdo->prepare("SELECT id FROM sites WHERE id = :site_id AND tenant_id = :tenant_id LIMIT 1");
    $siteStmt->execute([':site_id' => $siteId, ':tenant_id' => $tenantId]);
    if (!$siteStmt->fetch()) json_response(['success' => false, 'message' => 'Site not found'], 404);

    $pdo->beginTransaction();
    if ($departmentId > 0) {
        $department = routing_department($pdo, $departmentId, $tenantId, $siteId, false);
        if (!$department) {
            $pdo->rollBack();
            json_response(['success' => false, 'message' => 'Department not found'], 404);
        }
        if ((int) $department['is_default'] === 1 && ($isDefault === 0 || $isActive === 0)) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Set another active department as default before disabling or demoting this department',
            ], 422);
        }
        $stmt = $pdo->prepare("\n            UPDATE departments SET name = :name, description = :description, color = :color,\n                routing_strategy = :strategy, queue_enabled = :queue_enabled, queue_message = :queue_message,\n                is_default = :is_default, is_active = :is_active\n            WHERE id = :id AND tenant_id = :tenant_id\n        ");
        $stmt->execute([
            ':name' => $name, ':description' => $description !== '' ? $description : null, ':color' => $color,
            ':strategy' => $strategy, ':queue_enabled' => $queueEnabled, ':queue_message' => $queueMessage !== '' ? $queueMessage : null,
            ':is_default' => $isDefault, ':is_active' => $isActive, ':id' => $departmentId, ':tenant_id' => $tenantId,
        ]);
    } else {
        $baseSlug = routing_slugify($name);
        $slug = $baseSlug;
        $suffix = 1;
        while (true) {
            $slugStmt = $pdo->prepare("SELECT 1 FROM departments WHERE site_id = :site_id AND slug = :slug LIMIT 1");
            $slugStmt->execute([':site_id' => $siteId, ':slug' => $slug]);
            if (!$slugStmt->fetchColumn()) break;
            $slug = $baseSlug . '-' . (++$suffix);
        }
        $stmt = $pdo->prepare("\n            INSERT INTO departments (tenant_id, site_id, name, slug, description, color, routing_strategy, queue_enabled, queue_message, is_default, is_active, created_by)\n            VALUES (:tenant_id, :site_id, :name, :slug, :description, :color, :strategy, :queue_enabled, :queue_message, :is_default, :is_active, :created_by)\n        ");
        $stmt->execute([
            ':tenant_id' => $tenantId, ':site_id' => $siteId, ':name' => $name, ':slug' => $slug,
            ':description' => $description !== '' ? $description : null, ':color' => $color, ':strategy' => $strategy,
            ':queue_enabled' => $queueEnabled, ':queue_message' => $queueMessage !== '' ? $queueMessage : null,
            ':is_default' => $isDefault, ':is_active' => $isActive, ':created_by' => (int) $user['id'],
        ]);
        $departmentId = (int) $pdo->lastInsertId();
    }

    $defaultCountStmt = $pdo->prepare("SELECT COUNT(*) FROM departments WHERE site_id = :site_id AND is_default = 1 AND is_active = 1");
    $defaultCountStmt->execute([':site_id' => $siteId]);
    if ($isDefault || (int) $defaultCountStmt->fetchColumn() === 0) {
        $isDefault = 1;
        $pdo->prepare("UPDATE departments SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE site_id = :site_id")
            ->execute([':id' => $departmentId, ':site_id' => $siteId]);
        $pdo->prepare("UPDATE sites SET default_department_id = :id WHERE id = :site_id AND tenant_id = :tenant_id")
            ->execute([':id' => $departmentId, ':site_id' => $siteId, ':tenant_id' => $tenantId]);
    }

    $pdo->commit();
    json_response(['success' => true, 'message' => 'Department saved successfully', 'department_id' => $departmentId], $isNewDepartment ? 201 : 200);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to save department'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
