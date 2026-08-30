<?php

declare(strict_types=1);

// Creates or refreshes a safe starter rule set for one tenant.
// Usage: php backend/cli/seed-automation-defaults.php <tenant-id> [actor-user-id]

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/automation.php';

$tenantId = max(0, (int) ($argv[1] ?? 0));
$actorUserId = max(0, (int) ($argv[2] ?? 0));
if ($tenantId <= 0) {
    fwrite(STDERR, "Usage: php backend/cli/seed-automation-defaults.php <tenant-id> [actor-user-id]\n");
    exit(1);
}
if (!automation_tables_ready($pdo)) {
    fwrite(STDERR, "Automation tables are not installed. Run the automation center migration first.\n");
    exit(1);
}

$tenantStmt = $pdo->prepare("SELECT id, name FROM tenants WHERE id = :id AND status = 'active' LIMIT 1");
$tenantStmt->execute([':id' => $tenantId]);
$tenant = $tenantStmt->fetch();
if (!$tenant) {
    fwrite(STDERR, "Active tenant not found.\n");
    exit(1);
}

if ($actorUserId > 0) {
    $actorStmt = $pdo->prepare("SELECT id FROM users WHERE id = :id AND tenant_id = :tenant_id AND role = 'customer_admin' AND is_active = 1 LIMIT 1");
    $actorStmt->execute([':id' => $actorUserId, ':tenant_id' => $tenantId]);
    if (!$actorStmt->fetchColumn()) {
        fwrite(STDERR, "The actor must be an active customer admin of this tenant.\n");
        exit(1);
    }
} else {
    $actorStmt = $pdo->prepare("SELECT id FROM users WHERE tenant_id = :tenant_id AND role = 'customer_admin' AND is_active = 1 ORDER BY id LIMIT 1");
    $actorStmt->execute([':tenant_id' => $tenantId]);
    $actorUserId = (int) ($actorStmt->fetchColumn() ?: 0);
}

$presets = [
    [
        'name' => 'تشخیص پیام‌های فوری',
        'description' => 'پیام‌های حساس مشتری را فوری می‌کند و به مدیران هشدار می‌دهد.',
        'trigger_type' => 'visitor_message',
        'match_type' => 'any',
        'conditions' => [
            ['field' => 'event.message_text', 'operator' => 'contains', 'value' => 'فوری'],
            ['field' => 'event.message_text', 'operator' => 'contains', 'value' => 'ضروری'],
            ['field' => 'event.message_text', 'operator' => 'contains', 'value' => 'اورژانسی'],
        ],
        'actions' => [
            ['type' => 'set_priority', 'value' => 'urgent'],
            [
                'type' => 'create_alert',
                'title' => 'پیام فوری مشتری',
                'message' => 'یک پیام فوری یا ضروری دریافت شده و نیازمند بررسی سریع است.',
                'severity' => 'high',
                'recipient_mode' => 'admins',
            ],
        ],
        'priority' => 10,
        'cooldown_seconds' => 900,
    ],
    [
        'name' => 'بازگشت پاسخ مشتری به جریان کار',
        'description' => 'وقتی مشتری در وضعیت منتظر مشتری پاسخ می‌دهد، گفتگو دوباره فعال می‌شود.',
        'trigger_type' => 'visitor_message',
        'match_type' => 'all',
        'conditions' => [
            ['field' => 'conversation.status', 'operator' => 'equals', 'value' => 'waiting_customer'],
        ],
        'actions' => [
            ['type' => 'set_status', 'value' => 'in_progress'],
            [
                'type' => 'create_alert',
                'title' => 'مشتری پاسخ داد',
                'message' => 'مشتری دوباره پیام فرستاد و گفتگو به جریان پاسخ‌گویی برگشت.',
                'severity' => 'info',
                'recipient_mode' => 'assigned_agent',
            ],
        ],
        'priority' => 20,
        'cooldown_seconds' => 60,
    ],
    [
        'name' => 'پیگیری گفتگوهای راکد',
        'description' => 'گفتگوهای فعال بدون پیام را پس از ۳۰ دقیقه وارد مرحله پیگیری می‌کند.',
        'trigger_type' => 'scheduled_check',
        'match_type' => 'all',
        'conditions' => [
            ['field' => 'conversation.status', 'operator' => 'in', 'value' => 'open,in_progress,pending'],
            ['field' => 'metrics.idle_minutes', 'operator' => 'greater_than', 'value' => '30'],
        ],
        'actions' => [
            ['type' => 'set_status', 'value' => 'follow_up'],
            ['type' => 'add_tag', 'value' => 'نیازمند پیگیری', 'color' => '#f59e0b'],
        ],
        'priority' => 200,
        'cooldown_seconds' => 3600,
    ],
];

$find = $pdo->prepare("SELECT id FROM automation_rules WHERE tenant_id = :tenant_id AND site_id IS NULL AND name = :name ORDER BY id LIMIT 1");
$insert = $pdo->prepare("
    INSERT INTO automation_rules (
        tenant_id, site_id, name, description, trigger_type, match_type,
        conditions_json, actions_json, is_active, priority, cooldown_seconds,
        stop_processing, created_by, updated_by
    ) VALUES (
        :tenant_id, NULL, :name, :description, :trigger_type, :match_type,
        :conditions_json, :actions_json, 1, :priority, :cooldown_seconds,
        0, :created_by, :updated_by
    )
");
$update = $pdo->prepare("
    UPDATE automation_rules SET
        description = :description, trigger_type = :trigger_type, match_type = :match_type,
        conditions_json = :conditions_json, actions_json = :actions_json, is_active = 1,
        priority = :priority, cooldown_seconds = :cooldown_seconds,
        stop_processing = 0, updated_by = :updated_by
    WHERE id = :id AND tenant_id = :tenant_id
");

$result = [];
try {
    $pdo->beginTransaction();
    foreach ($presets as $preset) {
        $conditions = automation_normalize_conditions($preset['conditions']);
        $actions = automation_normalize_actions($preset['actions']);
        $find->execute([':tenant_id' => $tenantId, ':name' => $preset['name']]);
        $ruleId = (int) ($find->fetchColumn() ?: 0);
        $params = [
            ':tenant_id' => $tenantId,
            ':description' => $preset['description'],
            ':trigger_type' => $preset['trigger_type'],
            ':match_type' => $preset['match_type'],
            ':conditions_json' => automation_json($conditions),
            ':actions_json' => automation_json($actions),
            ':priority' => $preset['priority'],
            ':cooldown_seconds' => $preset['cooldown_seconds'],
            ':updated_by' => $actorUserId > 0 ? $actorUserId : null,
        ];
        if ($ruleId > 0) {
            $update->execute($params + [':id' => $ruleId]);
            $operation = 'updated';
        } else {
            $insert->execute($params + [
                ':name' => $preset['name'],
                ':created_by' => $actorUserId > 0 ? $actorUserId : null,
            ]);
            $ruleId = (int) $pdo->lastInsertId();
            $operation = 'created';
        }
        $result[] = ['id' => $ruleId, 'name' => $preset['name'], 'operation' => $operation, 'active' => true];
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, 'Failed to seed automation defaults: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

echo json_encode([
    'success' => true,
    'tenant_id' => $tenantId,
    'tenant_name' => $tenant['name'],
    'rules' => $result,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;

