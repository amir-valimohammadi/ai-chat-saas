<?php

/**
 * Automation Center v1.
 *
 * The engine is deliberately event-driven and builds on the existing routing layer.
 * Rules are tenant-scoped, conditions are evaluated server-side, and every matched
 * execution is claimed with a unique event key before actions run.
 */

require_once __DIR__ . '/routing.php';
require_once __DIR__ . '/hosted-support.php';

function automation_tables_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;

    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('automation_rules','automation_execution_logs','automation_sla_policies','conversation_sla_status','automation_alerts','conversation_tags','conversation_tag_assignments')");
        $ready = (int) $stmt->fetchColumn() === 7;
    } catch (Throwable) {
        $ready = false;
    }

    return $ready;
}

function automation_trigger_catalog(): array
{
    return [
        'conversation_created' => 'شروع گفتگوی جدید',
        'visitor_message' => 'پیام جدید مشتری',
        'agent_message' => 'پاسخ پشتیبان',
        'status_changed' => 'تغییر وضعیت گفتگو',
        'assignment_changed' => 'تغییر مسئول یا دپارتمان',
        'scheduled_check' => 'بررسی زمان‌بندی‌شده',
        'sla_warning' => 'نزدیک‌شدن به SLA',
        'sla_breached' => 'نقض SLA',
    ];
}

function automation_condition_catalog(): array
{
    return [
        'conversation.status' => 'وضعیت گفتگو',
        'conversation.priority' => 'اولویت گفتگو',
        'conversation.queue_status' => 'وضعیت صف',
        'conversation.department_id' => 'دپارتمان',
        'conversation.assigned_agent_id' => 'پشتیبان مسئول',
        'conversation.site_id' => 'سایت',
        'conversation.source_page_url' => 'آدرس صفحه ورود',
        'visitor.device_type' => 'نوع دستگاه',
        'visitor.name' => 'نام مخاطب',
        'visitor.email' => 'ایمیل مخاطب',
        'event.message_text' => 'متن پیام رویداد',
        'event.previous_status' => 'وضعیت قبلی',
        'metrics.waiting_minutes' => 'دقایق حضور در صف',
        'metrics.idle_minutes' => 'دقایق بدون پیام',
        'metrics.age_minutes' => 'سن گفتگو به دقیقه',
        'schedule.outside_business_hours' => 'خارج از ساعت کاری',
        'sla.state' => 'وضعیت SLA',
        'tags.names' => 'برچسب گفتگو',
    ];
}

function automation_operator_catalog(): array
{
    return [
        'equals' => 'برابر است با',
        'not_equals' => 'برابر نیست با',
        'contains' => 'شامل می‌شود',
        'not_contains' => 'شامل نمی‌شود',
        'greater_than' => 'بیشتر از',
        'less_than' => 'کمتر از',
        'in' => 'یکی از مقادیر',
        'not_in' => 'هیچ‌کدام از مقادیر',
        'is_empty' => 'خالی است',
        'not_empty' => 'خالی نیست',
    ];
}

function automation_action_catalog(): array
{
    return [
        'set_priority' => 'تغییر اولویت',
        'set_status' => 'تغییر وضعیت',
        'assign_department' => 'انتقال به دپارتمان',
        'assign_agent' => 'تخصیص به پشتیبان',
        'add_internal_note' => 'افزودن یادداشت داخلی',
        'send_message' => 'ارسال پیام خودکار',
        'create_alert' => 'ساخت هشدار',
        'add_tag' => 'افزودن برچسب',
    ];
}

function automation_decode_list(mixed $value): array
{
    if (is_array($value)) return array_values($value);
    if (!is_string($value) || trim($value) === '') return [];

    try {
        $decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        return is_array($decoded) ? array_values($decoded) : [];
    } catch (Throwable) {
        return [];
    }
}

function automation_json(?array $value): ?string
{
    if ($value === null) return null;
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}

function automation_normalize_conditions(mixed $conditions): array
{
    $allowedFields = array_keys(automation_condition_catalog());
    $allowedOperators = array_keys(automation_operator_catalog());
    $normalized = [];

    foreach (automation_decode_list($conditions) as $condition) {
        if (!is_array($condition)) continue;
        $field = trim((string) ($condition['field'] ?? ''));
        $operator = trim((string) ($condition['operator'] ?? 'equals'));
        if (!in_array($field, $allowedFields, true) || !in_array($operator, $allowedOperators, true)) {
            throw new InvalidArgumentException('شرط انتخاب‌شده معتبر نیست.');
        }

        $value = $condition['value'] ?? '';
        if (is_string($value)) $value = mb_substr(trim($value), 0, 1000, 'UTF-8');
        if (!is_scalar($value) && !is_array($value) && $value !== null) {
            throw new InvalidArgumentException('مقدار شرط معتبر نیست.');
        }

        $normalized[] = ['field' => $field, 'operator' => $operator, 'value' => $value];
    }

    return $normalized;
}

function automation_normalize_actions(mixed $actions): array
{
    $allowed = array_keys(automation_action_catalog());
    $normalized = [];

    foreach (automation_decode_list($actions) as $action) {
        if (!is_array($action)) continue;
        $type = trim((string) ($action['type'] ?? ''));
        if (!in_array($type, $allowed, true)) {
            throw new InvalidArgumentException('اقدام انتخاب‌شده معتبر نیست.');
        }

        $item = ['type' => $type];
        foreach (['value', 'message', 'title', 'severity', 'recipient_mode', 'color'] as $key) {
            if (!array_key_exists($key, $action)) continue;
            $raw = is_scalar($action[$key]) || $action[$key] === null ? (string) ($action[$key] ?? '') : '';
            $item[$key] = mb_substr(trim($raw), 0, $key === 'message' ? 5000 : 500, 'UTF-8');
        }

        if (in_array($type, ['set_priority', 'set_status', 'assign_department', 'assign_agent', 'add_tag'], true) && trim((string) ($item['value'] ?? '')) === '') {
            throw new InvalidArgumentException('مقدار اقدام انتخاب‌شده الزامی است.');
        }
        if (in_array($type, ['add_internal_note', 'send_message', 'create_alert'], true) && trim((string) ($item['message'] ?? '')) === '') {
            throw new InvalidArgumentException('متن اقدام انتخاب‌شده الزامی است.');
        }

        $normalized[] = $item;
    }

    if (!$normalized) {
        throw new InvalidArgumentException('حداقل یک اقدام برای قانون لازم است.');
    }

    return $normalized;
}

function automation_get_conversation_context(PDO $pdo, int $conversationId, array $event = []): ?array
{
    $stmt = $pdo->prepare("
        SELECT
            conversations.id, conversations.site_id, conversations.visitor_id,
            conversations.department_id, conversations.assigned_agent_id,
            conversations.status, conversations.priority, conversations.queue_status,
            conversations.queue_position, conversations.queued_at, conversations.assigned_at,
            conversations.source_page_url, conversations.source_page_title,
            conversations.last_message_at, conversations.created_at, conversations.closed_at,
            sites.tenant_id, sites.name AS site_name,
            visitors.name AS visitor_name, visitors.email AS visitor_email,
            visitors.phone AS visitor_phone, visitors.device_type,
            departments.name AS department_name,
            assigned_agent.name AS assigned_agent_name,
            conversation_sla_status.state AS sla_state,
            TIMESTAMPDIFF(MINUTE, COALESCE(conversations.queued_at, NOW()), NOW()) AS waiting_minutes,
            TIMESTAMPDIFF(MINUTE, COALESCE(conversations.last_message_at, conversations.created_at), NOW()) AS idle_minutes,
            TIMESTAMPDIFF(MINUTE, conversations.created_at, NOW()) AS age_minutes
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN departments ON departments.id = conversations.department_id
        LEFT JOIN users AS assigned_agent ON assigned_agent.id = conversations.assigned_agent_id
        LEFT JOIN conversation_sla_status ON conversation_sla_status.conversation_id = conversations.id
        WHERE conversations.id = :conversation_id
        LIMIT 1
    ");
    $stmt->execute([':conversation_id' => $conversationId]);
    $row = $stmt->fetch();
    if (!$row) return null;

    $tagStmt = $pdo->prepare("
        SELECT conversation_tags.name
        FROM conversation_tag_assignments
        INNER JOIN conversation_tags ON conversation_tags.id = conversation_tag_assignments.tag_id
        WHERE conversation_tag_assignments.conversation_id = :conversation_id
        ORDER BY conversation_tags.name
    ");
    $tagStmt->execute([':conversation_id' => $conversationId]);
    $tags = array_map(static fn(array $item): string => (string) $item['name'], $tagStmt->fetchAll());

    return [
        'conversation' => [
            'id' => (int) $row['id'],
            'site_id' => (int) $row['site_id'],
            'visitor_id' => (int) $row['visitor_id'],
            'department_id' => $row['department_id'] !== null ? (int) $row['department_id'] : null,
            'assigned_agent_id' => $row['assigned_agent_id'] !== null ? (int) $row['assigned_agent_id'] : null,
            'status' => $row['status'],
            'priority' => $row['priority'],
            'queue_status' => $row['queue_status'],
            'queue_position' => $row['queue_position'] !== null ? (int) $row['queue_position'] : null,
            'source_page_url' => $row['source_page_url'],
            'source_page_title' => $row['source_page_title'],
            'site_name' => $row['site_name'],
            'department_name' => $row['department_name'],
            'assigned_agent_name' => $row['assigned_agent_name'],
            'created_at' => $row['created_at'],
            'last_message_at' => $row['last_message_at'],
        ],
        'tenant_id' => (int) $row['tenant_id'],
        'visitor' => [
            'name' => $row['visitor_name'],
            'email' => $row['visitor_email'],
            'phone' => $row['visitor_phone'],
            'device_type' => $row['device_type'],
        ],
        'metrics' => [
            'waiting_minutes' => $row['queue_status'] === 'waiting' ? max(0, (int) $row['waiting_minutes']) : 0,
            'idle_minutes' => max(0, (int) $row['idle_minutes']),
            'age_minutes' => max(0, (int) $row['age_minutes']),
        ],
        'sla' => ['state' => $row['sla_state'] ?? null],
        'tags' => ['names' => $tags],
        'event' => $event,
    ];
}

function automation_context_value(array &$context, string $field, PDO $pdo): mixed
{
    if ($field === 'schedule.outside_business_hours') {
        if (!array_key_exists('outside_business_hours', $context['schedule'] ?? [])) {
            $status = hosted_support_compute_status(
                $pdo,
                (int) $context['conversation']['site_id'],
                hosted_support_site_timezone($pdo, (int) $context['conversation']['site_id'])
            );
            $context['schedule']['outside_business_hours'] = !$status['is_within_business_hours'];
        }
        return $context['schedule']['outside_business_hours'];
    }

    $value = $context;
    foreach (explode('.', $field) as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) return null;
        $value = $value[$segment];
    }
    return $value;
}

function automation_list_value(mixed $value): array
{
    if (is_array($value)) return array_map(static fn($item): string => mb_strtolower(trim((string) $item), 'UTF-8'), $value);
    return array_values(array_filter(array_map(
        static fn(string $item): string => mb_strtolower(trim($item), 'UTF-8'),
        preg_split('/[,،|]+/u', (string) $value) ?: []
    ), static fn(string $item): bool => $item !== ''));
}

function automation_compare(mixed $actual, string $operator, mixed $expected): bool
{
    if ($operator === 'is_empty') return $actual === null || $actual === '' || $actual === [];
    if ($operator === 'not_empty') return !($actual === null || $actual === '' || $actual === []);

    if (is_bool($actual)) {
        $expectedBool = filter_var($expected, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($expectedBool !== null) $expected = $expectedBool;
    }

    if (in_array($operator, ['greater_than', 'less_than'], true)) {
        if (!is_numeric($actual) || !is_numeric($expected)) return false;
        return $operator === 'greater_than' ? (float) $actual > (float) $expected : (float) $actual < (float) $expected;
    }

    $expectedList = automation_list_value($expected);
    if (in_array($operator, ['in', 'not_in'], true)) {
        if (is_array($actual)) {
            $matched = (bool) array_intersect(automation_list_value($actual), $expectedList);
        } else {
            $matched = in_array(mb_strtolower(trim((string) $actual), 'UTF-8'), $expectedList, true);
        }
        return $operator === 'in' ? $matched : !$matched;
    }

    if (is_array($actual)) {
        $actualList = automation_list_value($actual);
        $needle = mb_strtolower(trim((string) $expected), 'UTF-8');
        $contains = in_array($needle, $actualList, true);
        return match ($operator) {
            'equals', 'contains' => $contains,
            'not_equals', 'not_contains' => !$contains,
            default => false,
        };
    }

    $actualString = mb_strtolower(trim((string) ($actual ?? '')), 'UTF-8');
    $expectedString = mb_strtolower(trim((string) ($expected ?? '')), 'UTF-8');

    return match ($operator) {
        'equals' => $actualString === $expectedString,
        'not_equals' => $actualString !== $expectedString,
        'contains' => $expectedString !== '' && str_contains($actualString, $expectedString),
        'not_contains' => $expectedString === '' || !str_contains($actualString, $expectedString),
        default => false,
    };
}

function automation_rule_matches(PDO $pdo, array $rule, array &$context): array
{
    $conditions = automation_decode_list($rule['conditions_json'] ?? $rule['conditions'] ?? []);
    if (!$conditions) return ['matched' => true, 'results' => []];

    $results = [];
    foreach ($conditions as $condition) {
        if (!is_array($condition)) continue;
        $field = (string) ($condition['field'] ?? '');
        $operator = (string) ($condition['operator'] ?? 'equals');
        $actual = automation_context_value($context, $field, $pdo);
        $matched = automation_compare($actual, $operator, $condition['value'] ?? null);
        $results[] = [
            'field' => $field,
            'operator' => $operator,
            'expected' => $condition['value'] ?? null,
            'actual' => is_scalar($actual) || $actual === null ? $actual : $actual,
            'matched' => $matched,
        ];
    }

    $matchType = ($rule['match_type'] ?? 'all') === 'any' ? 'any' : 'all';
    $matched = $matchType === 'any'
        ? (bool) array_filter($results, static fn(array $item): bool => $item['matched'])
        : !array_filter($results, static fn(array $item): bool => !$item['matched']);

    return ['matched' => $matched, 'results' => $results];
}

function automation_claim_execution(PDO $pdo, array $rule, array $context, string $triggerType, ?string $eventKey, array $conditionResults): int
{
    if ($eventKey !== null && $eventKey !== '') {
        $check = $pdo->prepare("SELECT id FROM automation_execution_logs WHERE rule_id = :rule_id AND event_key = :event_key LIMIT 1");
        $check->execute([':rule_id' => (int) $rule['id'], ':event_key' => $eventKey]);
        if ($check->fetchColumn()) return 0;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO automation_execution_logs (
                rule_id, tenant_id, site_id, conversation_id, rule_name,
                trigger_type, event_key, status, condition_context_json
            ) VALUES (
                :rule_id, :tenant_id, :site_id, :conversation_id, :rule_name,
                :trigger_type, :event_key, 'skipped', :condition_context_json
            )
        ");
        $stmt->execute([
            ':rule_id' => (int) $rule['id'],
            ':tenant_id' => (int) $context['tenant_id'],
            ':site_id' => (int) $context['conversation']['site_id'],
            ':conversation_id' => (int) $context['conversation']['id'],
            ':rule_name' => (string) $rule['name'],
            ':trigger_type' => $triggerType,
            ':event_key' => $eventKey ?: null,
            ':condition_context_json' => automation_json(['conditions' => $conditionResults]),
        ]);
        return (int) $pdo->lastInsertId();
    } catch (PDOException $e) {
        if ((string) $e->getCode() === '23000') return 0;
        throw $e;
    }
}

function automation_add_alert(
    PDO $pdo,
    array $context,
    ?int $ruleId,
    string $severity,
    string $title,
    string $message,
    string $recipientMode = 'admins'
): int {
    $allowedSeverity = ['info', 'warning', 'high', 'critical'];
    if (!in_array($severity, $allowedSeverity, true)) $severity = 'warning';

    $recipients = [null];
    if ($recipientMode === 'assigned_agent' && !empty($context['conversation']['assigned_agent_id'])) {
        $recipients = [(int) $context['conversation']['assigned_agent_id']];
    } elseif ($recipientMode === 'admins') {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE tenant_id = :tenant_id AND role = 'customer_admin' AND is_active = 1");
        $stmt->execute([':tenant_id' => (int) $context['tenant_id']]);
        $ids = array_map(static fn(array $row): int => (int) $row['id'], $stmt->fetchAll());
        if ($ids) $recipients = $ids;
    }

    $insert = $pdo->prepare("
        INSERT INTO automation_alerts (
            tenant_id, site_id, rule_id, conversation_id, recipient_user_id,
            severity, title, message
        ) VALUES (
            :tenant_id, :site_id, :rule_id, :conversation_id, :recipient_user_id,
            :severity, :title, :message
        )
    ");
    $firstId = 0;
    foreach (array_unique($recipients, SORT_REGULAR) as $recipientId) {
        $insert->execute([
            ':tenant_id' => (int) $context['tenant_id'],
            ':site_id' => (int) $context['conversation']['site_id'],
            ':rule_id' => $ruleId,
            ':conversation_id' => (int) $context['conversation']['id'],
            ':recipient_user_id' => $recipientId,
            ':severity' => $severity,
            ':title' => mb_substr($title, 0, 190, 'UTF-8'),
            ':message' => mb_substr($message, 0, 5000, 'UTF-8'),
        ]);
        if ($firstId === 0) $firstId = (int) $pdo->lastInsertId();
    }

    return $firstId;
}

function automation_execute_action(PDO $pdo, array $rule, array &$context, array $action, ?int $actorUserId): array
{
    $type = (string) ($action['type'] ?? '');
    $conversationId = (int) $context['conversation']['id'];
    $tenantId = (int) $context['tenant_id'];
    $siteId = (int) $context['conversation']['site_id'];
    $value = trim((string) ($action['value'] ?? ''));

    if ($type === 'set_priority') {
        if (!in_array($value, ['low', 'normal', 'high', 'urgent'], true)) throw new RuntimeException('اولویت اقدام معتبر نیست.');
        $pdo->prepare("UPDATE conversations SET priority = :priority WHERE id = :id")->execute([':priority' => $value, ':id' => $conversationId]);
        $context['conversation']['priority'] = $value;
        return ['type' => $type, 'value' => $value, 'success' => true];
    }

    if ($type === 'set_status') {
        if (!in_array($value, ['new', 'open', 'in_progress', 'waiting_customer', 'follow_up', 'pending', 'closed'], true)) throw new RuntimeException('وضعیت اقدام معتبر نیست.');
        $previousStatus = (string) ($context['conversation']['status'] ?? '');
        $pdo->prepare("
            UPDATE conversations SET
                status = :status,
                closed_at = CASE WHEN :closed_status = 'closed' THEN NOW() ELSE NULL END,
                queue_status = CASE WHEN :queue_status = 'closed' THEN 'none' ELSE queue_status END,
                queue_position = CASE WHEN :queue_position = 'closed' THEN NULL ELSE queue_position END,
                queued_at = CASE WHEN :queued_at = 'closed' THEN NULL ELSE queued_at END
            WHERE id = :id
        ")->execute([
            ':status' => $value,
            ':closed_status' => $value,
            ':queue_status' => $value,
            ':queue_position' => $value,
            ':queued_at' => $value,
            ':id' => $conversationId,
        ]);
        if ($value === 'closed' && !empty($context['conversation']['department_id'])) {
            routing_reindex_queue($pdo, (int) $context['conversation']['department_id']);
        }
        if ($previousStatus !== $value) automation_sync_sla_status($pdo, $conversationId, $value);
        $context['conversation']['status'] = $value;
        return ['type' => $type, 'value' => $value, 'success' => true];
    }

    if ($type === 'assign_department') {
        $departmentId = (int) $value;
        $department = routing_department($pdo, $departmentId, $tenantId, $siteId, true);
        if (!$department) throw new RuntimeException('دپارتمان اقدام در دسترس نیست.');
        $pdo->prepare("UPDATE conversations SET department_id = :department_id, assigned_agent_id = NULL, queue_status = 'none', queue_position = NULL, queued_at = NULL, assigned_at = NULL, assignment_method = NULL WHERE id = :id")
            ->execute([':department_id' => $departmentId, ':id' => $conversationId]);
        $routing = routing_route_conversation($pdo, $conversationId, $department, $actorUserId);
        $context['conversation']['department_id'] = $departmentId;
        $context['conversation']['assigned_agent_id'] = $routing['agent']['id'] ?? null;
        return ['type' => $type, 'value' => $departmentId, 'routing' => $routing, 'success' => true];
    }

    if ($type === 'assign_agent') {
        $agentId = (int) $value;
        $stmt = $pdo->prepare("
            SELECT users.id, users.name, users.email
            FROM users
            LEFT JOIN agent_site_access ON agent_site_access.user_id = users.id AND agent_site_access.site_id = :site_id
            LEFT JOIN department_members ON department_members.user_id = users.id AND department_members.department_id = :department_id
            WHERE users.id = :agent_id AND users.tenant_id = :tenant_id AND users.is_active = 1
              AND users.role IN ('customer_admin','agent')
              AND (users.role = 'customer_admin' OR agent_site_access.site_id IS NOT NULL)
              AND (:department_check IS NULL OR users.role = 'customer_admin' OR department_members.user_id IS NOT NULL)
            LIMIT 1
        ");
        $departmentId = $context['conversation']['department_id'];
        $stmt->execute([
            ':site_id' => $siteId,
            ':department_id' => $departmentId,
            ':agent_id' => $agentId,
            ':tenant_id' => $tenantId,
            ':department_check' => $departmentId,
        ]);
        $agent = $stmt->fetch();
        if (!$agent) throw new RuntimeException('پشتیبان اقدام در دسترس نیست.');
        $previous = $context['conversation']['assigned_agent_id'];
        $pdo->prepare("
            UPDATE conversations SET assigned_agent_id = :agent_id, queue_status = 'assigned',
                queue_position = NULL, queued_at = NULL, assigned_at = NOW(),
                assignment_method = 'system',
                status = CASE WHEN status IN ('new','pending') THEN 'in_progress' ELSE status END
            WHERE id = :id
        ")->execute([':agent_id' => $agentId, ':id' => $conversationId]);
        routing_log_assignment($pdo, $conversationId, $departmentId, $previous, $agentId, 'auto_assigned', 'system', $actorUserId, 'automation_rule:' . $rule['id']);
        if ($departmentId) routing_reindex_queue($pdo, (int) $departmentId);
        $context['conversation']['assigned_agent_id'] = $agentId;
        return ['type' => $type, 'value' => $agentId, 'agent_name' => $agent['name'], 'success' => true];
    }

    if (in_array($type, ['add_internal_note', 'send_message'], true)) {
        $message = trim((string) ($action['message'] ?? ''));
        if ($message === '') throw new RuntimeException('متن پیام خودکار خالی است.');
        $isNote = $type === 'add_internal_note';
        $stmt = $pdo->prepare("
            INSERT INTO messages (conversation_id, sender_type, message_type, sender_id, content, is_read)
            VALUES (:conversation_id, 'system', :message_type, NULL, :content, :is_read)
        ");
        $stmt->execute([
            ':conversation_id' => $conversationId,
            ':message_type' => $isNote ? 'internal_note' : 'system',
            ':content' => mb_substr($message, 0, 5000, 'UTF-8'),
            ':is_read' => $isNote ? 1 : 0,
        ]);
        $messageId = (int) $pdo->lastInsertId();
        if (!$isNote) {
            $pdo->prepare("UPDATE conversations SET last_message_at = NOW(), status = CASE WHEN status = 'new' THEN 'open' ELSE status END WHERE id = :id")
                ->execute([':id' => $conversationId]);
        }
        return ['type' => $type, 'message_id' => $messageId, 'success' => true];
    }

    if ($type === 'create_alert') {
        $message = trim((string) ($action['message'] ?? ''));
        $title = trim((string) ($action['title'] ?? 'هشدار اتوماسیون'));
        $alertId = automation_add_alert(
            $pdo,
            $context,
            (int) $rule['id'],
            (string) ($action['severity'] ?? 'warning'),
            $title !== '' ? $title : 'هشدار اتوماسیون',
            $message,
            (string) ($action['recipient_mode'] ?? 'admins')
        );
        return ['type' => $type, 'alert_id' => $alertId, 'success' => true];
    }

    if ($type === 'add_tag') {
        $tagName = mb_substr(trim($value), 0, 100, 'UTF-8');
        if ($tagName === '') throw new RuntimeException('نام برچسب خالی است.');
        $color = preg_match('/^#[0-9a-f]{6}$/i', (string) ($action['color'] ?? ''))
            ? (string) $action['color']
            : '#64748b';
        $stmt = $pdo->prepare("SELECT id FROM conversation_tags WHERE tenant_id = :tenant_id AND site_id = :site_id AND name = :name LIMIT 1");
        $stmt->execute([':tenant_id' => $tenantId, ':site_id' => $siteId, ':name' => $tagName]);
        $tagId = (int) ($stmt->fetchColumn() ?: 0);
        if ($tagId <= 0) {
            $pdo->prepare("INSERT INTO conversation_tags (tenant_id, site_id, name, color) VALUES (:tenant_id, :site_id, :name, :color)")
                ->execute([':tenant_id' => $tenantId, ':site_id' => $siteId, ':name' => $tagName, ':color' => $color]);
            $tagId = (int) $pdo->lastInsertId();
        }
        $pdo->prepare("INSERT IGNORE INTO conversation_tag_assignments (conversation_id, tag_id, assigned_by) VALUES (:conversation_id, :tag_id, :assigned_by)")
            ->execute([':conversation_id' => $conversationId, ':tag_id' => $tagId, ':assigned_by' => $actorUserId]);
        if (!in_array($tagName, $context['tags']['names'], true)) $context['tags']['names'][] = $tagName;
        return ['type' => $type, 'tag_id' => $tagId, 'value' => $tagName, 'success' => true];
    }

    throw new RuntimeException('اقدام پشتیبانی‌نشده است.');
}

function automation_finish_execution(PDO $pdo, int $logId, int $ruleId, string $status, int $durationMs, array $results = [], ?string $error = null): void
{
    $pdo->prepare("
        UPDATE automation_execution_logs
        SET status = :status, duration_ms = :duration_ms,
            action_results_json = :action_results_json, error_message = :error_message
        WHERE id = :id
    ")->execute([
        ':status' => $status,
        ':duration_ms' => max(0, $durationMs),
        ':action_results_json' => automation_json($results),
        ':error_message' => $error ? mb_substr($error, 0, 2000, 'UTF-8') : null,
        ':id' => $logId,
    ]);

    $pdo->prepare("
        UPDATE automation_rules SET
            last_run_at = NOW(), run_count = run_count + 1,
            success_count = success_count + :success_increment,
            failure_count = failure_count + :failure_increment
        WHERE id = :id
    ")->execute([
        ':success_increment' => $status === 'success' ? 1 : 0,
        ':failure_increment' => $status === 'failed' ? 1 : 0,
        ':id' => $ruleId,
    ]);
}

function automation_dispatch_event(
    PDO $pdo,
    string $triggerType,
    int $conversationId,
    array $event = [],
    ?int $actorUserId = null,
    ?string $eventKey = null
): array {
    if (!automation_tables_ready($pdo) || !array_key_exists($triggerType, automation_trigger_catalog())) {
        return ['available' => false, 'matched' => 0, 'executed' => 0, 'failed' => 0];
    }

    if ($triggerType === 'conversation_created') automation_attach_sla($pdo, $conversationId);
    if ($triggerType === 'agent_message' && ($event['message_type'] ?? 'text') !== 'internal_note') {
        automation_mark_first_response($pdo, $conversationId);
    }
    if ($triggerType === 'status_changed' && isset($event['new_status'])) {
        automation_sync_sla_status($pdo, $conversationId, (string) $event['new_status']);
    }

    $context = automation_get_conversation_context($pdo, $conversationId, $event);
    if (!$context) return ['available' => true, 'matched' => 0, 'executed' => 0, 'failed' => 0];

    $stmt = $pdo->prepare("
        SELECT *
        FROM automation_rules
        WHERE tenant_id = :tenant_id
          AND (site_id IS NULL OR site_id = :site_id)
          AND trigger_type = :trigger_type
          AND is_active = 1
        ORDER BY priority ASC, id ASC
    ");
    $stmt->execute([
        ':tenant_id' => (int) $context['tenant_id'],
        ':site_id' => (int) $context['conversation']['site_id'],
        ':trigger_type' => $triggerType,
    ]);

    $summary = ['available' => true, 'matched' => 0, 'executed' => 0, 'failed' => 0];
    foreach ($stmt->fetchAll() as $rule) {
        if ((int) $rule['cooldown_seconds'] > 0) {
            $cooldownSeconds = max(1, (int) $rule['cooldown_seconds']);
            $cooldown = $pdo->prepare("SELECT id FROM automation_execution_logs WHERE rule_id = :rule_id AND conversation_id = :conversation_id AND status = 'success' AND created_at >= DATE_SUB(NOW(), INTERVAL {$cooldownSeconds} SECOND) LIMIT 1");
            $cooldown->bindValue(':rule_id', (int) $rule['id'], PDO::PARAM_INT);
            $cooldown->bindValue(':conversation_id', $conversationId, PDO::PARAM_INT);
            $cooldown->execute();
            if ($cooldown->fetchColumn()) continue;
        }

        $match = automation_rule_matches($pdo, $rule, $context);
        if (!$match['matched']) continue;
        $summary['matched']++;

        // Event keys are unique per rule in the database, so the conversation
        // identity must be part of the derived key as well as the event token.
        $derivedKey = $eventKey
            ? mb_substr($triggerType . ':conversation:' . $conversationId . ':' . $eventKey, 0, 190, 'UTF-8')
            : null;
        $logId = automation_claim_execution($pdo, $rule, $context, $triggerType, $derivedKey, $match['results']);
        if ($logId <= 0) continue;

        $started = microtime(true);
        $actionResults = [];
        $startedTransaction = !$pdo->inTransaction();
        $ruleExecuted = false;
        try {
            if ($startedTransaction) $pdo->beginTransaction();
            foreach (automation_decode_list($rule['actions_json']) as $action) {
                if (!is_array($action)) continue;
                $actionResults[] = automation_execute_action($pdo, $rule, $context, $action, $actorUserId);
            }
            if ($startedTransaction) $pdo->commit();
            automation_finish_execution($pdo, $logId, (int) $rule['id'], 'success', (int) round((microtime(true) - $started) * 1000), $actionResults);
            $summary['executed']++;
            $ruleExecuted = true;
        } catch (Throwable $e) {
            if ($startedTransaction && $pdo->inTransaction()) $pdo->rollBack();
            automation_finish_execution($pdo, $logId, (int) $rule['id'], 'failed', (int) round((microtime(true) - $started) * 1000), $actionResults, $e->getMessage());
            $summary['failed']++;
            if (function_exists('app_log_error')) app_log_error($e, ['component' => 'automation', 'rule_id' => (int) $rule['id'], 'conversation_id' => $conversationId]);
        }

        if ((int) $rule['stop_processing'] === 1 && $ruleExecuted) break;
    }

    return $summary;
}

function automation_dispatch_event_safe(
    PDO $pdo,
    string $triggerType,
    int $conversationId,
    array $event = [],
    ?int $actorUserId = null,
    ?string $eventKey = null
): array {
    try {
        return automation_dispatch_event($pdo, $triggerType, $conversationId, $event, $actorUserId, $eventKey);
    } catch (Throwable $e) {
        if (function_exists('app_log_error')) {
            app_log_error($e, [
                'component' => 'automation_dispatch',
                'trigger_type' => $triggerType,
                'conversation_id' => $conversationId,
            ]);
        }
        return ['available' => true, 'matched' => 0, 'executed' => 0, 'failed' => 1];
    }
}

function automation_sla_timezone(?string $timezone = null): DateTimeZone
{
    $fallback = (string) app_config('timezone', 'Asia/Tehran');
    try {
        return new DateTimeZone(trim((string) $timezone) !== '' ? (string) $timezone : $fallback);
    } catch (Throwable) {
        return new DateTimeZone($fallback ?: 'Asia/Tehran');
    }
}

function automation_sla_storage_timezone(): DateTimeZone
{
    return automation_sla_timezone((string) app_config('timezone', 'Asia/Tehran'));
}

function automation_sla_parse_storage(string $value, ?string $targetTimezone = null): DateTimeImmutable
{
    $date = new DateTimeImmutable($value, automation_sla_storage_timezone());
    return $targetTimezone !== null ? $date->setTimezone(automation_sla_timezone($targetTimezone)) : $date;
}

function automation_sla_format_storage(DateTimeImmutable $value): string
{
    return $value->setTimezone(automation_sla_storage_timezone())->format('Y-m-d H:i:s');
}

/** Return the effective working interval for one local calendar date. */
function automation_sla_day_window(PDO $pdo, int $siteId, DateTimeImmutable $date): array
{
    static $cache = [];
    $key = spl_object_id($pdo) . ':' . $siteId . ':' . $date->format('Y-m-dP');
    if (isset($cache[$key])) return $cache[$key];

    $schedule = hosted_support_schedule_for_date($pdo, $siteId, $date);
    $open = null;
    $close = null;
    if (!empty($schedule['is_open'])) {
        $open = hosted_support_datetime_at($date, $schedule['open_time'] ?? null);
        $close = hosted_support_datetime_at($date, $schedule['close_time'] ?? null);
        if (!$open || !$close || $close <= $open) {
            $open = null;
            $close = null;
        }
    }

    return $cache[$key] = [
        'open' => $open,
        'close' => $close,
        'source' => (string) ($schedule['source'] ?? 'none'),
        'title' => $schedule['title'] ?? null,
    ];
}

function automation_sla_calendar_has_opening(PDO $pdo, int $siteId, DateTimeImmutable $from): bool
{
    $weeklyStmt = $pdo->prepare("
        SELECT 1 FROM site_business_hours
        WHERE site_id = :site_id AND is_open = 1
          AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time
        LIMIT 1
    ");
    $weeklyStmt->execute([':site_id' => $siteId]);
    if ($weeklyStmt->fetchColumn()) return true;

    $exceptionStmt = $pdo->prepare("
        SELECT 1 FROM site_schedule_exceptions
        WHERE site_id = :site_id AND exception_date >= :from_date AND is_closed = 0
          AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time
        LIMIT 1
    ");
    $exceptionStmt->execute([':site_id' => $siteId, ':from_date' => $from->format('Y-m-d')]);
    return (bool) $exceptionStmt->fetchColumn();
}

function automation_sla_add_business_seconds(
    PDO $pdo,
    int $siteId,
    DateTimeImmutable $start,
    int $seconds,
    string $timezone
): DateTimeImmutable {
    $remaining = max(0, $seconds);
    $cursor = $start->setTimezone(automation_sla_timezone($timezone));
    if ($remaining === 0) return $cursor;
    if (!automation_sla_calendar_has_opening($pdo, $siteId, $cursor)) {
        throw new RuntimeException('تقویم سایت هیچ بازه کاری بازی ندارد.');
    }

    for ($days = 0; $days < 3700; $days++) {
        $window = automation_sla_day_window($pdo, $siteId, $cursor);
        $open = $window['open'];
        $close = $window['close'];

        if ($open && $close && $cursor < $close) {
            $segmentStart = $cursor > $open ? $cursor : $open;
            $available = max(0, $close->getTimestamp() - $segmentStart->getTimestamp());
            if ($available > 0 && $remaining <= $available) {
                return $segmentStart->setTimestamp($segmentStart->getTimestamp() + $remaining);
            }
            $remaining -= $available;
        }

        $cursor = $cursor->modify('+1 day')->setTime(0, 0, 0);
    }

    throw new RuntimeException('برای محاسبه SLA هیچ بازه کاری معتبری در تقویم سایت پیدا نشد.');
}

function automation_sla_business_seconds_between(
    PDO $pdo,
    int $siteId,
    DateTimeImmutable $from,
    DateTimeImmutable $to,
    string $timezone
): int {
    if ($from->getTimestamp() === $to->getTimestamp()) return 0;
    if ($from > $to) {
        return -automation_sla_business_seconds_between($pdo, $siteId, $to, $from, $timezone);
    }

    $tz = automation_sla_timezone($timezone);
    $start = $from->setTimezone($tz);
    $end = $to->setTimezone($tz);
    $day = $start->setTime(0, 0, 0);
    $endDay = $end->setTime(0, 0, 0);
    $seconds = 0;

    for ($days = 0; $day <= $endDay && $days < 3700; $days++) {
        $window = automation_sla_day_window($pdo, $siteId, $day);
        if ($window['open'] && $window['close']) {
            $segmentStart = $window['open'] > $start ? $window['open'] : $start;
            $segmentEnd = $window['close'] < $end ? $window['close'] : $end;
            if ($segmentEnd > $segmentStart) {
                $seconds += $segmentEnd->getTimestamp() - $segmentStart->getTimestamp();
            }
        }
        $day = $day->modify('+1 day')->setTime(0, 0, 0);
    }

    if ($day <= $endDay) {
        throw new RuntimeException('بازه زمانی SLA از محدوده امن محاسبه تقویم کاری بزرگ‌تر است.');
    }
    return $seconds;
}

function automation_sla_clock_state(
    PDO $pdo,
    int $siteId,
    DateTimeImmutable $at,
    string $timezone
): array {
    $local = $at->setTimezone(automation_sla_timezone($timezone));
    $today = automation_sla_day_window($pdo, $siteId, $local);
    if ($today['open'] && $today['close'] && $local >= $today['open'] && $local < $today['close']) {
        return [
            'running' => true,
            'reason' => null,
            'next_open_at' => null,
            'next_transition_at' => $today['close'],
        ];
    }

    $reason = $today['source'] === 'exception' && !$today['open'] ? 'holiday' : 'outside_business_hours';
    if (!automation_sla_calendar_has_opening($pdo, $siteId, $local)) {
        return ['running' => false, 'reason' => $reason, 'next_open_at' => null, 'next_transition_at' => null];
    }
    $cursor = $local->setTime(0, 0, 0);
    for ($days = 0; $days < 3700; $days++) {
        $window = automation_sla_day_window($pdo, $siteId, $cursor);
        if ($window['open'] && $window['open'] > $local) {
            return [
                'running' => false,
                'reason' => $reason,
                'next_open_at' => $window['open'],
                'next_transition_at' => $window['open'],
            ];
        }
        $cursor = $cursor->modify('+1 day')->setTime(0, 0, 0);
    }

    return ['running' => false, 'reason' => $reason, 'next_open_at' => null, 'next_transition_at' => null];
}

function automation_sla_remaining_seconds(PDO $pdo, array $sla, string $dueAt, DateTimeImmutable $at): int
{
    $due = automation_sla_parse_storage($dueAt, (string) ($sla['sla_timezone'] ?? 'Asia/Tehran'));
    if (empty($sla['uses_business_hours'])) return $due->getTimestamp() - $at->getTimestamp();

    return automation_sla_business_seconds_between(
        $pdo,
        (int) $sla['site_id'],
        $at,
        $due,
        (string) $sla['sla_timezone']
    );
}

function automation_sla_pause_statuses(array $sla): array
{
    return array_values(array_filter(
        automation_decode_list($sla['pause_statuses_json'] ?? null),
        static fn(mixed $status): bool => is_string($status) && $status !== ''
    ));
}

/** Keep the resolution clock in sync with the conversation status. */
function automation_sync_sla_status(PDO $pdo, int $conversationId, string $status): void
{
    if (!automation_tables_ready($pdo)) return;
    automation_attach_sla($pdo, $conversationId);

    $startedTransaction = !$pdo->inTransaction();
    try {
        if ($startedTransaction) $pdo->beginTransaction();
        $stmt = $pdo->prepare("\n            SELECT conversation_sla_status.*, conversations.site_id,\n                   automation_sla_policies.breach_priority\n            FROM conversation_sla_status\n            INNER JOIN conversations ON conversations.id = conversation_sla_status.conversation_id\n            INNER JOIN automation_sla_policies ON automation_sla_policies.id = conversation_sla_status.policy_id\n            WHERE conversation_sla_status.conversation_id = :conversation_id\n            LIMIT 1 FOR UPDATE\n        ");
        $stmt->execute([':conversation_id' => $conversationId]);
        $sla = $stmt->fetch();
        if (!$sla) {
            if ($startedTransaction) $pdo->commit();
            return;
        }

        $now = new DateTimeImmutable('now', automation_sla_storage_timezone());
        if ($status === 'closed') {
            if ((string) $sla['state'] === 'resolved') {
                if ($startedTransaction) $pdo->commit();
                return;
            }

            $firstRemaining = empty($sla['first_response_at'])
                ? automation_sla_remaining_seconds($pdo, $sla, (string) $sla['first_response_due_at'], $now)
                : 1;
            $resolutionRemaining = !empty($sla['paused_at'])
                ? max(0, (int) ($sla['resolution_remaining_seconds'] ?? 0))
                : max(0, automation_sla_remaining_seconds($pdo, $sla, (string) $sla['resolution_due_at'], $now));
            $firstBreachClaimed = empty($sla['first_response_at'])
                && empty($sla['first_response_breached_at'])
                && $firstRemaining <= 0;
            $resolutionBreachClaimed = empty($sla['resolution_breached_at'])
                && $resolutionRemaining <= 0;

            $closeSla = $pdo->prepare("\n                UPDATE conversation_sla_status SET state = 'resolved', resolved_at = COALESCE(resolved_at, :resolved_at),\n                    first_response_breached_at = CASE WHEN :first_breached = 1 THEN COALESCE(first_response_breached_at, :first_breached_at) ELSE first_response_breached_at END,\n                    resolution_breached_at = CASE WHEN :resolution_breached = 1 THEN COALESCE(resolution_breached_at, :resolution_breached_at) ELSE resolution_breached_at END,\n                    paused_at = NULL, paused_status = NULL, resolution_remaining_seconds = :resolution_remaining, last_checked_at = NOW()\n                WHERE conversation_id = :conversation_id\n            ");
            $closedAt = automation_sla_format_storage($now);
            $closeSla->execute([
                ':resolved_at' => $closedAt,
                ':first_breached' => $firstBreachClaimed ? 1 : 0,
                ':first_breached_at' => $closedAt,
                ':resolution_breached' => $resolutionBreachClaimed ? 1 : 0,
                ':resolution_breached_at' => $closedAt,
                ':resolution_remaining' => $resolutionRemaining,
                ':conversation_id' => $conversationId,
            ]);
            if ($firstBreachClaimed || $resolutionBreachClaimed) {
                $pdo->prepare("UPDATE conversations SET priority = :priority WHERE id = :conversation_id")
                    ->execute([':priority' => $sla['breach_priority'], ':conversation_id' => $conversationId]);
            }
            if ($startedTransaction) $pdo->commit();

            if ($firstBreachClaimed || $resolutionBreachClaimed) {
                $context = automation_get_conversation_context($pdo, $conversationId);
                if ($context) {
                    if ($firstBreachClaimed) {
                        automation_add_alert($pdo, $context, null, 'critical', 'SLA پاسخ اولیه نقض شد', 'گفتگوی #' . $conversationId . ' پس از پایان مهلت پاسخ اولیه بسته شد.', 'admins');
                        automation_dispatch_event_safe($pdo, 'sla_breached', $conversationId, ['sla_type' => 'first_response'], null, 'first-response');
                    }
                    if ($resolutionBreachClaimed) {
                        automation_add_alert($pdo, $context, null, 'critical', 'SLA حل گفتگو نقض شد', 'گفتگوی #' . $conversationId . ' پس از پایان مهلت حل بسته شد.', 'admins');
                        automation_dispatch_event_safe($pdo, 'sla_breached', $conversationId, ['sla_type' => 'resolution'], null, 'resolution');
                    }
                }
            }
            return;
        }

        if ((string) $sla['state'] === 'resolved') {
            $closedAt = !empty($sla['resolved_at'])
                ? automation_sla_parse_storage((string) $sla['resolved_at'])
                : $now;
            $resolutionRemaining = $sla['resolution_remaining_seconds'] !== null
                ? max(0, (int) $sla['resolution_remaining_seconds'])
                : max(0, automation_sla_remaining_seconds($pdo, $sla, (string) $sla['resolution_due_at'], $closedAt));
            $firstRemaining = empty($sla['first_response_at'])
                ? max(0, automation_sla_remaining_seconds($pdo, $sla, (string) $sla['first_response_due_at'], $closedAt))
                : null;
            $calendarFallback = false;

            if (!empty($sla['uses_business_hours'])) {
                try {
                    $newResolutionDue = automation_sla_add_business_seconds($pdo, (int) $sla['site_id'], $now, $resolutionRemaining, (string) $sla['sla_timezone']);
                    $newFirstResponseDue = $firstRemaining !== null
                        ? automation_sla_add_business_seconds($pdo, (int) $sla['site_id'], $now, $firstRemaining, (string) $sla['sla_timezone'])
                        : automation_sla_parse_storage((string) $sla['first_response_due_at']);
                } catch (Throwable $e) {
                    $calendarFallback = true;
                    $newResolutionDue = $now->setTimestamp($now->getTimestamp() + $resolutionRemaining);
                    $newFirstResponseDue = $firstRemaining !== null
                        ? $now->setTimestamp($now->getTimestamp() + $firstRemaining)
                        : automation_sla_parse_storage((string) $sla['first_response_due_at']);
                    if (function_exists('app_log_error')) {
                        app_log_error($e, ['component' => 'automation_sla_reopen', 'conversation_id' => $conversationId]);
                    }
                }
            } else {
                $newResolutionDue = $now->setTimestamp($now->getTimestamp() + $resolutionRemaining);
                $newFirstResponseDue = $firstRemaining !== null
                    ? $now->setTimestamp($now->getTimestamp() + $firstRemaining)
                    : automation_sla_parse_storage((string) $sla['first_response_due_at']);
            }

            $hasBreach = !empty($sla['first_response_breached_at']) || !empty($sla['resolution_breached_at']) || $resolutionRemaining <= 0;
            $hasWarning = !empty($sla['resolution_warning_sent_at'])
                || (empty($sla['first_response_at']) && !empty($sla['warning_sent_at']));
            $reopenedState = $hasBreach ? 'breached' : ($hasWarning ? 'warning' : (!empty($sla['first_response_at']) ? 'met' : 'tracking'));
            $reopenSla = $pdo->prepare("\n                UPDATE conversation_sla_status SET state = :state, resolved_at = NULL,\n                    first_response_due_at = :first_response_due_at, resolution_due_at = :resolution_due_at,\n                    paused_at = NULL, paused_status = NULL, resolution_remaining_seconds = NULL,\n                    uses_business_hours = CASE WHEN :calendar_fallback = 1 THEN 0 ELSE uses_business_hours END,\n                    last_checked_at = NOW()\n                WHERE conversation_id = :conversation_id AND state = 'resolved'\n            ");
            $reopenSla->execute([
                ':state' => $reopenedState,
                ':first_response_due_at' => automation_sla_format_storage($newFirstResponseDue),
                ':resolution_due_at' => automation_sla_format_storage($newResolutionDue),
                ':calendar_fallback' => $calendarFallback ? 1 : 0,
                ':conversation_id' => $conversationId,
            ]);
            $sla['state'] = $reopenedState;
            $sla['first_response_due_at'] = automation_sla_format_storage($newFirstResponseDue);
            $sla['resolution_due_at'] = automation_sla_format_storage($newResolutionDue);
            $sla['resolved_at'] = null;
            $sla['paused_at'] = null;
            $sla['paused_status'] = null;
            $sla['resolution_remaining_seconds'] = null;
            if ($calendarFallback) $sla['uses_business_hours'] = 0;
        }

        $shouldPause = in_array($status, automation_sla_pause_statuses($sla), true);
        if ($shouldPause && empty($sla['paused_at'])) {
            $remaining = max(0, automation_sla_remaining_seconds($pdo, $sla, (string) $sla['resolution_due_at'], $now));
            $pdo->prepare("\n                UPDATE conversation_sla_status SET paused_at = :paused_at, paused_status = :paused_status,\n                    resolution_remaining_seconds = :remaining, last_checked_at = NOW()\n                WHERE conversation_id = :conversation_id AND paused_at IS NULL\n            ")->execute([
                ':paused_at' => automation_sla_format_storage($now),
                ':paused_status' => $status,
                ':remaining' => $remaining,
                ':conversation_id' => $conversationId,
            ]);
        } elseif ($shouldPause && (string) $sla['paused_status'] !== $status) {
            $pdo->prepare("UPDATE conversation_sla_status SET paused_status = :status, last_checked_at = NOW() WHERE conversation_id = :conversation_id")
                ->execute([':status' => $status, ':conversation_id' => $conversationId]);
        } elseif (!$shouldPause && !empty($sla['paused_at'])) {
            $remaining = max(0, (int) ($sla['resolution_remaining_seconds'] ?? 0));
            $calendarFallback = false;
            if (!empty($sla['uses_business_hours'])) {
                try {
                    $newDue = automation_sla_add_business_seconds($pdo, (int) $sla['site_id'], $now, $remaining, (string) $sla['sla_timezone']);
                } catch (Throwable $e) {
                    $calendarFallback = true;
                    $newDue = $now->setTimestamp($now->getTimestamp() + $remaining);
                    if (function_exists('app_log_error')) {
                        app_log_error($e, ['component' => 'automation_sla_resume', 'conversation_id' => $conversationId]);
                    }
                }
            } else {
                $newDue = $now->setTimestamp($now->getTimestamp() + $remaining);
            }
            $pausedAt = automation_sla_parse_storage((string) $sla['paused_at']);
            $pausedSeconds = max(0, $now->getTimestamp() - $pausedAt->getTimestamp());
            $pdo->prepare("
                UPDATE conversation_sla_status SET resolution_due_at = :resolution_due_at,
                    paused_at = NULL, paused_status = NULL, resolution_remaining_seconds = NULL,
                    uses_business_hours = CASE WHEN :calendar_fallback = 1 THEN 0 ELSE uses_business_hours END,
                    total_paused_seconds = total_paused_seconds + :paused_seconds, last_checked_at = NOW()
                WHERE conversation_id = :conversation_id AND paused_at IS NOT NULL
            ")->execute([
                ':resolution_due_at' => automation_sla_format_storage($newDue),
                ':calendar_fallback' => $calendarFallback ? 1 : 0,
                ':paused_seconds' => $pausedSeconds,
                ':conversation_id' => $conversationId,
            ]);
        }

        if ($startedTransaction) $pdo->commit();
    } catch (Throwable $e) {
        if ($startedTransaction && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function automation_attach_sla(PDO $pdo, int $conversationId): ?array
{
    if (!automation_tables_ready($pdo)) return null;

    $conversationStmt = $pdo->prepare("
        SELECT conversations.id, conversations.site_id, conversations.created_at, sites.tenant_id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE conversations.id = :conversation_id
        LIMIT 1
    ");
    $conversationStmt->execute([':conversation_id' => $conversationId]);
    $conversation = $conversationStmt->fetch();
    if (!$conversation) return null;

    $policyStmt = $pdo->prepare("
        SELECT *
        FROM automation_sla_policies
        WHERE tenant_id = :tenant_id
          AND (site_id = :site_id OR site_id IS NULL)
          AND is_active = 1
          AND :conversation_created_at >= effective_from
        ORDER BY (site_id IS NOT NULL) DESC, is_default DESC, id ASC
        LIMIT 1
    ");
    $policyStmt->execute([
        ':tenant_id' => (int) $conversation['tenant_id'],
        ':site_id' => (int) $conversation['site_id'],
        ':conversation_created_at' => $conversation['created_at'],
    ]);
    $policy = $policyStmt->fetch();
    if (!$policy) return null;

    $createdAt = automation_sla_parse_storage((string) $conversation['created_at']);
    $usesBusinessHours = !empty($policy['use_business_hours']);
    $timezone = hosted_support_site_timezone($pdo, (int) $conversation['site_id']);
    if ($usesBusinessHours) {
        try {
            hosted_support_ensure_defaults($pdo, (int) $conversation['site_id']);
            $firstResponseDue = automation_sla_add_business_seconds(
                $pdo,
                (int) $conversation['site_id'],
                $createdAt,
                max(1, (int) $policy['first_response_minutes']) * 60,
                $timezone
            );
            $resolutionDue = automation_sla_add_business_seconds(
                $pdo,
                (int) $conversation['site_id'],
                $createdAt,
                max(1, (int) $policy['resolution_minutes']) * 60,
                $timezone
            );
        } catch (Throwable $e) {
            // An all-closed or malformed calendar must not break conversation automations.
            $usesBusinessHours = false;
            if (function_exists('app_log_error')) {
                app_log_error($e, ['component' => 'automation_sla_calendar', 'conversation_id' => $conversationId]);
            }
        }
    }
    if (!$usesBusinessHours) {
        $firstResponseDue = $createdAt->setTimestamp($createdAt->getTimestamp() + max(1, (int) $policy['first_response_minutes']) * 60);
        $resolutionDue = $createdAt->setTimestamp($createdAt->getTimestamp() + max(1, (int) $policy['resolution_minutes']) * 60);
    }
    $firstResponseDueAt = automation_sla_format_storage($firstResponseDue);
    $resolutionDueAt = automation_sla_format_storage($resolutionDue);
    $pauseStatusesJson = automation_json(automation_sla_pause_statuses($policy));

    $stmt = $pdo->prepare("
        INSERT IGNORE INTO conversation_sla_status (
            conversation_id, policy_id, uses_business_hours, sla_timezone, pause_statuses_json,
            state, first_response_due_at, resolution_due_at
        ) VALUES (
            :conversation_id, :policy_id, :uses_business_hours, :sla_timezone, :pause_statuses_json,
            'tracking', :first_response_due_at, :resolution_due_at
        )
    ");
    $stmt->bindValue(':conversation_id', $conversationId, PDO::PARAM_INT);
    $stmt->bindValue(':policy_id', (int) $policy['id'], PDO::PARAM_INT);
    $stmt->bindValue(':uses_business_hours', $usesBusinessHours ? 1 : 0, PDO::PARAM_INT);
    $stmt->bindValue(':sla_timezone', $timezone);
    $stmt->bindValue(':pause_statuses_json', $pauseStatusesJson);
    $stmt->bindValue(':first_response_due_at', $firstResponseDueAt);
    $stmt->bindValue(':resolution_due_at', $resolutionDueAt);
    $stmt->execute();

    return $policy;
}

function automation_mark_first_response(PDO $pdo, int $conversationId): void
{
    if (!automation_tables_ready($pdo)) return;
    automation_attach_sla($pdo, $conversationId);

    $firstMessageStmt = $pdo->prepare("
        SELECT MIN(created_at)
        FROM messages
        WHERE conversation_id = :conversation_id
          AND sender_type = 'agent'
          AND message_type <> 'internal_note'
    ");
    $firstMessageStmt->execute([':conversation_id' => $conversationId]);
    $firstResponseAt = $firstMessageStmt->fetchColumn() ?: date('Y-m-d H:i:s');

    $slaStmt = $pdo->prepare("
        SELECT conversation_sla_status.*, conversations.site_id,
               automation_sla_policies.breach_priority, automation_sla_policies.breach_department_id
        FROM conversation_sla_status
        INNER JOIN conversations ON conversations.id = conversation_sla_status.conversation_id
        INNER JOIN automation_sla_policies ON automation_sla_policies.id = conversation_sla_status.policy_id
        WHERE conversation_sla_status.conversation_id = :conversation_id
        LIMIT 1
    ");
    $slaStmt->execute([':conversation_id' => $conversationId]);
    $sla = $slaStmt->fetch();
    if (!$sla || !empty($sla['first_response_at'])) return;

    $responseTime = automation_sla_parse_storage((string) $firstResponseAt);
    $late = automation_sla_remaining_seconds($pdo, $sla, (string) $sla['first_response_due_at'], $responseTime) <= 0;
    $update = $pdo->prepare("
        UPDATE conversation_sla_status
        SET first_response_at = COALESCE(first_response_at, :first_response_at),
            first_response_breached_at = CASE
                WHEN :late = 1 THEN COALESCE(first_response_breached_at, :breached_at)
                ELSE first_response_breached_at
            END,
            state = CASE
                WHEN :late_state = 1 THEN 'breached'
                WHEN state = 'warning' AND first_response_breached_at IS NULL AND resolution_warning_sent_at IS NULL THEN 'tracking'
                ELSE state
            END,
            last_checked_at = NOW()
        WHERE conversation_id = :conversation_id AND first_response_at IS NULL
    ");
    $update->execute([
        ':first_response_at' => $firstResponseAt,
        ':late' => $late ? 1 : 0,
        ':breached_at' => $firstResponseAt,
        ':late_state' => $late ? 1 : 0,
        ':conversation_id' => $conversationId,
    ]);

    if ($late && $update->rowCount() > 0) {
        $pdo->prepare("UPDATE conversations SET priority = :priority WHERE id = :conversation_id")
            ->execute([':priority' => $sla['breach_priority'], ':conversation_id' => $conversationId]);
        $context = automation_get_conversation_context($pdo, $conversationId);
        if ($context) {
            automation_add_alert($pdo, $context, null, 'critical', 'SLA پاسخ اولیه نقض شد', 'پاسخ اولیه گفتگوی #' . $conversationId . ' پس از سررسید ارسال شد.', 'admins');
            automation_dispatch_event($pdo, 'sla_breached', $conversationId, ['sla_type' => 'first_response'], null, 'first-response');
        }
    }
}

function automation_sla_snapshot_from_row(PDO $pdo, array $sla, ?DateTimeImmutable $at = null): array
{
    $now = $at ?? new DateTimeImmutable('now', automation_sla_storage_timezone());
    $slaTimezone = (string) ($sla['sla_timezone'] ?? 'Asia/Tehran');
    $formatSnapshotDate = static function (mixed $value) use ($slaTimezone): ?string {
        if ($value === null || trim((string) $value) === '') return null;
        return automation_sla_parse_storage((string) $value, $slaTimezone)->format(DateTimeInterface::ATOM);
    };
    $completed = (string) ($sla['state'] ?? '') === 'resolved'
        || (string) ($sla['conversation_status'] ?? '') === 'closed';
    $phase = $completed ? 'completed' : (empty($sla['first_response_at']) ? 'first_response' : 'resolution');
    $paused = $phase === 'resolution' && !empty($sla['paused_at']);
    $dueField = $phase === 'first_response' ? 'first_response_due_at' : 'resolution_due_at';

    if ($completed) {
        $remaining = 0;
    } elseif ($paused) {
        $remaining = max(0, (int) ($sla['resolution_remaining_seconds'] ?? 0));
    } else {
        $remaining = automation_sla_remaining_seconds($pdo, $sla, (string) $sla[$dueField], $now);
    }

    $clockRunning = !$completed && !$paused;
    $pauseReason = $paused ? ((string) ($sla['paused_status'] ?: 'waiting_customer')) : null;
    $nextOpenAt = null;
    $nextTransitionAt = null;
    if ($clockRunning && !empty($sla['uses_business_hours'])) {
        $clock = automation_sla_clock_state(
            $pdo,
            (int) $sla['site_id'],
            $now,
            (string) $sla['sla_timezone']
        );
        $clockRunning = (bool) $clock['running'];
        $pauseReason = $clockRunning ? null : $clock['reason'];
        $nextOpenAt = $clock['next_open_at'] instanceof DateTimeImmutable
            ? $clock['next_open_at']->format(DateTimeInterface::ATOM)
            : null;
        $nextTransitionAt = $clock['next_transition_at'] instanceof DateTimeImmutable
            ? $clock['next_transition_at']->format(DateTimeInterface::ATOM)
            : null;
    }

    return [
        'policy_id' => (int) $sla['policy_id'],
        'policy_name' => (string) ($sla['policy_name'] ?? ''),
        'state' => (string) $sla['state'],
        'phase' => $phase,
        'remaining_seconds' => $remaining,
        'snapshot_epoch' => $now->getTimestamp(),
        'clock_running' => $clockRunning,
        'pause_reason' => $pauseReason,
        'next_open_at' => $nextOpenAt,
        'next_transition_at' => $nextTransitionAt,
        'use_business_hours' => !empty($sla['uses_business_hours']),
        'timezone' => $slaTimezone,
        'pause_statuses' => automation_sla_pause_statuses($sla),
        'first_response_due_at' => $formatSnapshotDate($sla['first_response_due_at'] ?? null),
        'resolution_due_at' => $formatSnapshotDate($sla['resolution_due_at'] ?? null),
        'first_response_at' => $formatSnapshotDate($sla['first_response_at'] ?? null),
        'paused_at' => $formatSnapshotDate($sla['paused_at'] ?? null),
        'paused_status' => $sla['paused_status'] ?? null,
        'total_paused_seconds' => (int) ($sla['total_paused_seconds'] ?? 0),
        'warning_sent_at' => $formatSnapshotDate($sla['warning_sent_at'] ?? null),
        'resolution_warning_sent_at' => $formatSnapshotDate($sla['resolution_warning_sent_at'] ?? null),
        'first_response_breached_at' => $formatSnapshotDate($sla['first_response_breached_at'] ?? null),
        'resolution_breached_at' => $formatSnapshotDate($sla['resolution_breached_at'] ?? null),
        'resolved_at' => $formatSnapshotDate($sla['resolved_at'] ?? null),
        'last_checked_at' => $formatSnapshotDate($sla['last_checked_at'] ?? null),
    ];
}

function automation_get_sla_snapshot(PDO $pdo, int $conversationId): ?array
{
    if (!automation_tables_ready($pdo)) return null;
    $stmt = $pdo->prepare("
        SELECT conversation_sla_status.*, automation_sla_policies.name AS policy_name,
               conversations.site_id, conversations.status AS conversation_status
        FROM conversation_sla_status
        INNER JOIN automation_sla_policies ON automation_sla_policies.id = conversation_sla_status.policy_id
        INNER JOIN conversations ON conversations.id = conversation_sla_status.conversation_id
        WHERE conversation_sla_status.conversation_id = :conversation_id
        LIMIT 1
    ");
    $stmt->execute([':conversation_id' => $conversationId]);
    $sla = $stmt->fetch();
    return $sla ? automation_sla_snapshot_from_row($pdo, $sla) : null;
}

function automation_preview_rule(PDO $pdo, int $tenantId, int $conversationId, array $ruleInput): array
{
    $context = automation_get_conversation_context($pdo, $conversationId, [
        'message_text' => trim((string) ($ruleInput['sample_message'] ?? '')),
        'previous_status' => trim((string) ($ruleInput['previous_status'] ?? '')),
    ]);
    if (!$context || (int) $context['tenant_id'] !== $tenantId) {
        throw new InvalidArgumentException('گفتگو برای آزمایش قانون پیدا نشد.');
    }

    $rule = [
        'match_type' => ($ruleInput['match_type'] ?? 'all') === 'any' ? 'any' : 'all',
        'conditions' => automation_normalize_conditions($ruleInput['conditions'] ?? []),
    ];
    $result = automation_rule_matches($pdo, $rule, $context);

    return [
        'matched' => $result['matched'],
        'conditions' => $result['results'],
        'conversation' => [
            'id' => $context['conversation']['id'],
            'status' => $context['conversation']['status'],
            'priority' => $context['conversation']['priority'],
            'site_name' => $context['conversation']['site_name'],
        ],
    ];
}

function automation_run_scheduled(PDO $pdo, int $limit = 200, ?int $tenantId = null): array
{
    if (!automation_tables_ready($pdo)) return ['available' => false];

    $limit = max(1, min(1000, $limit));
    $summary = [
        'available' => true,
        'sla_attached' => 0,
        'sla_warnings' => 0,
        'sla_breaches' => 0,
        'scheduled_conversations' => 0,
        'executed' => 0,
        'failed' => 0,
    ];

    $tenantId = $tenantId !== null && $tenantId > 0 ? $tenantId : null;
    $missingTenantSql = $tenantId !== null ? ' AND sites.tenant_id = :missing_tenant_id ' : '';
    $missing = $pdo->prepare("
        SELECT conversations.id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE conversations.status <> 'closed'
          {$missingTenantSql}
          AND NOT EXISTS (SELECT 1 FROM conversation_sla_status WHERE conversation_sla_status.conversation_id = conversations.id)
          AND EXISTS (
              SELECT 1 FROM automation_sla_policies
              WHERE automation_sla_policies.tenant_id = sites.tenant_id
                AND (automation_sla_policies.site_id = conversations.site_id OR automation_sla_policies.site_id IS NULL)
                AND automation_sla_policies.is_active = 1
                AND conversations.created_at >= automation_sla_policies.effective_from
          )
        ORDER BY conversations.id ASC
        LIMIT {$limit}
    ");
    $missing->execute($tenantId !== null ? [':missing_tenant_id' => $tenantId] : []);
    foreach ($missing->fetchAll() as $row) {
        if (automation_attach_sla($pdo, (int) $row['id'])) $summary['sla_attached']++;
    }

    $slaTenantSql = $tenantId !== null ? ' AND sites.tenant_id = :sla_tenant_id ' : '';
    $slaStmt = $pdo->prepare("
        SELECT
            conversation_sla_status.*, automation_sla_policies.warning_before_minutes,
            automation_sla_policies.breach_priority, automation_sla_policies.breach_department_id,
            automation_sla_policies.name AS policy_name,
            conversations.status AS conversation_status, conversations.site_id
        FROM conversation_sla_status
        INNER JOIN automation_sla_policies ON automation_sla_policies.id = conversation_sla_status.policy_id
        INNER JOIN conversations ON conversations.id = conversation_sla_status.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE 1 = 1
          {$slaTenantSql}
          AND conversation_sla_status.state <> 'resolved'
          AND (conversations.status = 'closed' OR conversation_sla_status.resolution_breached_at IS NULL)
        ORDER BY COALESCE(conversation_sla_status.last_checked_at, '1970-01-01 00:00:00') ASC,
                 CASE
                     WHEN conversation_sla_status.first_response_at IS NULL
                          AND conversation_sla_status.first_response_breached_at IS NULL
                     THEN conversation_sla_status.first_response_due_at
                     ELSE conversation_sla_status.resolution_due_at
                 END ASC,
                 conversation_sla_status.conversation_id ASC
        LIMIT {$limit}
    ");
    $slaStmt->execute($tenantId !== null ? [':sla_tenant_id' => $tenantId] : []);

    foreach ($slaStmt->fetchAll() as $sla) {
        $conversationId = (int) $sla['conversation_id'];
        if ((string) $sla['conversation_status'] === 'closed') {
            automation_sync_sla_status($pdo, $conversationId, 'closed');
            continue;
        }

        // Repair tracking when a public agent-message endpoint missed the real-time hook.
        if (empty($sla['first_response_at'])) {
            $messageStmt = $pdo->prepare("SELECT 1 FROM messages WHERE conversation_id = :conversation_id AND sender_type = 'agent' AND message_type <> 'internal_note' LIMIT 1");
            $messageStmt->execute([':conversation_id' => $conversationId]);
            if ($messageStmt->fetchColumn()) automation_mark_first_response($pdo, $conversationId);
        }

        automation_sync_sla_status($pdo, $conversationId, (string) $sla['conversation_status']);
        $refreshStmt = $pdo->prepare("SELECT * FROM conversation_sla_status WHERE conversation_id = :conversation_id LIMIT 1");
        $refreshStmt->execute([':conversation_id' => $conversationId]);
        $refreshed = $refreshStmt->fetch();
        if (!$refreshed || (string) $refreshed['state'] === 'resolved') continue;
        $sla = array_merge($sla, $refreshed);

        $context = automation_get_conversation_context($pdo, $conversationId);
        if (!$context) continue;
        $now = new DateTimeImmutable('now', automation_sla_storage_timezone());
        $warningSeconds = max(0, (int) $sla['warning_before_minutes'] * 60);
        $firstRemaining = automation_sla_remaining_seconds($pdo, $sla, (string) $sla['first_response_due_at'], $now);

        if (empty($sla['first_response_at']) && empty($sla['warning_sent_at']) && $firstRemaining > 0 && $firstRemaining <= $warningSeconds) {
            $claimWarning = $pdo->prepare("UPDATE conversation_sla_status SET warning_sent_at = NOW(), state = CASE WHEN state = 'tracking' THEN 'warning' ELSE state END, last_checked_at = NOW() WHERE conversation_id = :id AND warning_sent_at IS NULL");
            $claimWarning->execute([':id' => $conversationId]);
            if ($claimWarning->rowCount() > 0) {
                automation_add_alert($pdo, $context, null, 'warning', 'SLA در آستانه نقض', 'زمان پاسخ اولیه گفتگوی #' . $conversationId . ' رو به پایان است.', 'assigned_agent');
                $result = automation_dispatch_event($pdo, 'sla_warning', $conversationId, ['sla_type' => 'first_response'], null, 'first-response');
                $summary['sla_warnings']++;
                $summary['executed'] += $result['executed'];
                $summary['failed'] += $result['failed'];
            }
        }

        if (empty($sla['first_response_at']) && empty($sla['first_response_breached_at']) && $firstRemaining <= 0) {
            $claimBreach = $pdo->prepare("UPDATE conversation_sla_status SET first_response_breached_at = NOW(), state = 'breached', last_checked_at = NOW() WHERE conversation_id = :id AND first_response_breached_at IS NULL");
            $claimBreach->execute([':id' => $conversationId]);
            if ($claimBreach->rowCount() > 0) {
                $pdo->prepare("UPDATE conversations SET priority = :priority WHERE id = :id")
                    ->execute([':priority' => $sla['breach_priority'], ':id' => $conversationId]);

                if (!empty($sla['breach_department_id'])) {
                    $department = routing_department($pdo, (int) $sla['breach_department_id'], (int) $context['tenant_id'], (int) $context['conversation']['site_id'], true);
                    if ($department) {
                        $pdo->prepare("UPDATE conversations SET department_id = :department_id, assigned_agent_id = NULL, queue_status = 'none', queue_position = NULL, queued_at = NULL, assigned_at = NULL, assignment_method = NULL WHERE id = :id")
                            ->execute([':department_id' => (int) $department['id'], ':id' => $conversationId]);
                        routing_route_conversation($pdo, $conversationId, $department);
                    }
                }

                automation_add_alert($pdo, $context, null, 'critical', 'SLA پاسخ اولیه نقض شد', 'گفتگوی #' . $conversationId . ' در بازه تعیین‌شده پاسخ نگرفت.', 'admins');
                $result = automation_dispatch_event($pdo, 'sla_breached', $conversationId, ['sla_type' => 'first_response'], null, 'first-response');
                $summary['sla_breaches']++;
                $summary['executed'] += $result['executed'];
                $summary['failed'] += $result['failed'];
            }
        }

        $resolutionRemaining = !empty($sla['paused_at'])
            ? max(0, (int) ($sla['resolution_remaining_seconds'] ?? 0))
            : automation_sla_remaining_seconds($pdo, $sla, (string) $sla['resolution_due_at'], $now);

        if (empty($sla['resolution_warning_sent_at']) && $resolutionRemaining > 0 && $resolutionRemaining <= $warningSeconds) {
            $claimWarning = $pdo->prepare("UPDATE conversation_sla_status SET resolution_warning_sent_at = NOW(), state = CASE WHEN state IN ('tracking','met') THEN 'warning' ELSE state END, last_checked_at = NOW() WHERE conversation_id = :id AND resolution_warning_sent_at IS NULL");
            $claimWarning->execute([':id' => $conversationId]);
            if ($claimWarning->rowCount() > 0) {
                automation_add_alert($pdo, $context, null, 'warning', 'SLA حل گفتگو در آستانه نقض', 'زمان حل گفتگوی #' . $conversationId . ' رو به پایان است.', 'assigned_agent');
                $result = automation_dispatch_event($pdo, 'sla_warning', $conversationId, ['sla_type' => 'resolution'], null, 'resolution');
                $summary['sla_warnings']++;
                $summary['executed'] += $result['executed'];
                $summary['failed'] += $result['failed'];
            }
        }

        if (empty($sla['resolution_breached_at']) && $resolutionRemaining <= 0) {
            $claimBreach = $pdo->prepare("UPDATE conversation_sla_status SET resolution_breached_at = NOW(), state = 'breached', last_checked_at = NOW() WHERE conversation_id = :id AND resolution_breached_at IS NULL");
            $claimBreach->execute([':id' => $conversationId]);
            if ($claimBreach->rowCount() > 0) {
                $pdo->prepare("UPDATE conversations SET priority = :priority WHERE id = :id")
                    ->execute([':priority' => $sla['breach_priority'], ':id' => $conversationId]);
                automation_add_alert($pdo, $context, null, 'critical', 'SLA حل گفتگو نقض شد', 'گفتگوی #' . $conversationId . ' هنوز در بازه تعیین‌شده بسته نشده است.', 'admins');
                $result = automation_dispatch_event($pdo, 'sla_breached', $conversationId, ['sla_type' => 'resolution'], null, 'resolution');
                $summary['sla_breaches']++;
                $summary['executed'] += $result['executed'];
                $summary['failed'] += $result['failed'];
            }
        }

        $pdo->prepare("UPDATE conversation_sla_status SET last_checked_at = NOW() WHERE conversation_id = :id")
            ->execute([':id' => $conversationId]);
    }

    $ruleTenantSql = $tenantId !== null ? ' AND tenant_id = :rule_tenant_id ' : '';
    $ruleStmt = $pdo->prepare("SELECT * FROM automation_rules WHERE trigger_type = 'scheduled_check' AND is_active = 1 {$ruleTenantSql} ORDER BY priority, id");
    $ruleStmt->execute($tenantId !== null ? [':rule_tenant_id' => $tenantId] : []);
    $bucket = date('YmdHi');
    foreach ($ruleStmt->fetchAll() as $rule) {
        $params = [':tenant_id' => (int) $rule['tenant_id']];
        $siteSql = '';
        if ($rule['site_id'] !== null) {
            $siteSql = ' AND conversations.site_id = :site_id ';
            $params[':site_id'] = (int) $rule['site_id'];
        }
        $conversationStmt = $pdo->prepare("
            SELECT conversations.id
            FROM conversations
            INNER JOIN sites ON sites.id = conversations.site_id
            WHERE sites.tenant_id = :tenant_id
              AND conversations.status <> 'closed'
              AND conversations.is_archived = 0
              {$siteSql}
            ORDER BY conversations.last_message_at ASC, conversations.id ASC
            LIMIT {$limit}
        ");
        $conversationStmt->execute($params);
        foreach ($conversationStmt->fetchAll() as $row) {
            $result = automation_dispatch_event($pdo, 'scheduled_check', (int) $row['id'], [], null, $bucket . ':' . $row['id']);
            $summary['scheduled_conversations']++;
            $summary['executed'] += $result['executed'];
            $summary['failed'] += $result['failed'];
        }
    }

    return $summary;
}
