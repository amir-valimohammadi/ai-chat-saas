<?php

/**
 * Department routing and queue helpers for messaging phase 5.
 * All public helpers validate tenant/site ownership through their SQL joins.
 */

function routing_allowed_strategies(): array
{
    return ['manual', 'round_robin', 'least_busy'];
}

function routing_slugify(string $value): string
{
    $value = trim(mb_strtolower($value, 'UTF-8'));
    $value = preg_replace('/[^\p{L}\p{N}]+/u', '-', $value) ?? '';
    $value = trim($value, '-');

    if ($value === '') {
        $value = 'department-' . bin2hex(random_bytes(4));
    }

    return mb_substr($value, 0, 120, 'UTF-8');
}

function routing_department(PDO $pdo, int $departmentId, int $tenantId, ?int $siteId = null, bool $activeOnly = false): ?array
{
    $conditions = [
        'departments.id = :department_id',
        'departments.tenant_id = :department_tenant_id',
        'sites.tenant_id = :site_tenant_id',
    ];
    $params = [
        ':department_id' => $departmentId,
        ':department_tenant_id' => $tenantId,
        ':site_tenant_id' => $tenantId,
    ];

    if ($siteId !== null) {
        $conditions[] = 'departments.site_id = :site_id';
        $params[':site_id'] = $siteId;
    }
    if ($activeOnly) {
        $conditions[] = 'departments.is_active = 1';
        $conditions[] = 'sites.is_active = 1';
    }

    $stmt = $pdo->prepare("\n        SELECT departments.*, sites.name AS site_name, sites.domain AS site_domain\n        FROM departments\n        INNER JOIN sites ON sites.id = departments.site_id\n        WHERE " . implode(' AND ', $conditions) . "\n        LIMIT 1\n    ");
    $stmt->execute($params);
    $row = $stmt->fetch();

    return $row ?: null;
}

function routing_site_departments(PDO $pdo, int $siteId, bool $activeOnly = true): array
{
    $sql = "\n        SELECT\n            departments.id, departments.name, departments.slug, departments.description,\n            departments.color, departments.routing_strategy, departments.queue_enabled,\n            departments.queue_message, departments.is_default, departments.is_active,\n            COUNT(DISTINCT CASE WHEN department_members.is_active = 1 THEN department_members.user_id END) AS member_count,\n            COUNT(DISTINCT CASE\n                WHEN conversations.queue_status = 'waiting' AND conversations.status <> 'closed'\n                THEN conversations.id END) AS waiting_count\n        FROM departments\n        LEFT JOIN department_members ON department_members.department_id = departments.id\n        LEFT JOIN conversations ON conversations.department_id = departments.id\n        WHERE departments.site_id = :site_id\n    ";
    if ($activeOnly) {
        $sql .= ' AND departments.is_active = 1 ';
    }
    $sql .= "\n        GROUP BY departments.id, departments.name, departments.slug, departments.description,\n                 departments.color, departments.routing_strategy, departments.queue_enabled,\n                 departments.queue_message, departments.is_default, departments.is_active\n        ORDER BY departments.is_default DESC, departments.name ASC\n    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':site_id' => $siteId]);
    return $stmt->fetchAll();
}


function routing_ensure_default_department(PDO $pdo, int $tenantId, int $siteId, ?int $createdBy = null): int
{
    $existingStmt = $pdo->prepare("\n        SELECT id\n        FROM departments\n        WHERE tenant_id = :tenant_id AND site_id = :site_id AND is_default = 1\n        ORDER BY is_active DESC, id ASC\n        LIMIT 1\n        FOR UPDATE\n    ");
    $existingStmt->execute([':tenant_id' => $tenantId, ':site_id' => $siteId]);
    $departmentId = (int) ($existingStmt->fetchColumn() ?: 0);

    if ($departmentId <= 0) {
        $insertStmt = $pdo->prepare("\n            INSERT INTO departments (\n                tenant_id, site_id, name, slug, description, color, routing_strategy,\n                queue_enabled, queue_message, is_default, is_active, created_by\n            ) VALUES (\n                :tenant_id, :site_id, 'پشتیبانی عمومی', :slug,\n                'دپارتمان پیش‌فرض برای پاسخ‌گویی به گفتگوهای سایت', '#2563eb', 'round_robin',\n                1, 'درخواست شما در صف پشتیبانی قرار گرفت و به‌زودی پاسخ داده می‌شود.', 1, 1, :created_by\n            )\n        ");
        $insertStmt->execute([
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
            ':slug' => 'general-' . $siteId,
            ':created_by' => $createdBy,
        ]);
        $departmentId = (int) $pdo->lastInsertId();
    }

    $pdo->prepare("\n        UPDATE departments\n        SET is_default = CASE WHEN id = :department_id THEN 1 ELSE 0 END\n        WHERE tenant_id = :tenant_id AND site_id = :site_id\n    ")->execute([
        ':department_id' => $departmentId,
        ':tenant_id' => $tenantId,
        ':site_id' => $siteId,
    ]);

    $pdo->prepare("\n        UPDATE sites\n        SET default_department_id = :department_id, department_selection_enabled = 1\n        WHERE id = :site_id AND tenant_id = :tenant_id\n    ")->execute([
        ':department_id' => $departmentId,
        ':site_id' => $siteId,
        ':tenant_id' => $tenantId,
    ]);

    $pdo->prepare("\n        INSERT IGNORE INTO department_members (\n            department_id, user_id, is_active, max_active_conversations, routing_weight\n        )\n        SELECT :department_id, users.id, 1, 5, 1\n        FROM users\n        INNER JOIN agent_site_access\n            ON agent_site_access.user_id = users.id\n           AND agent_site_access.site_id = :site_id\n        WHERE users.tenant_id = :tenant_id\n          AND users.role IN ('customer_admin','agent')\n          AND users.is_active = 1\n    ")->execute([
        ':department_id' => $departmentId,
        ':site_id' => $siteId,
        ':tenant_id' => $tenantId,
    ]);

    return $departmentId;
}

function routing_agent_is_online(?string $lastSeenAt, ?string $availabilityStatus): bool
{
    if ($availabilityStatus !== 'online' || !$lastSeenAt) {
        return false;
    }

    $timestamp = strtotime($lastSeenAt);
    return $timestamp !== false && $timestamp >= strtotime('-2 minutes');
}

function routing_candidate_agents(PDO $pdo, array $department, bool $onlineOnly = true): array
{
    $stmt = $pdo->prepare("\n        SELECT\n            users.id, users.name, users.email, users.last_seen_at, users.availability_status,\n            department_members.max_active_conversations, department_members.routing_weight,\n            department_members.last_assigned_at,\n            COUNT(DISTINCT active_conversations.id) AS active_conversation_count\n        FROM department_members\n        INNER JOIN users ON users.id = department_members.user_id\n        INNER JOIN agent_site_access\n            ON agent_site_access.user_id = users.id\n           AND agent_site_access.site_id = :site_id\n        LEFT JOIN conversations AS active_conversations\n            ON active_conversations.assigned_agent_id = users.id\n           AND active_conversations.department_id = department_members.department_id\n           AND active_conversations.status IN ('new','open','in_progress','waiting_customer','follow_up','pending')\n           AND active_conversations.is_archived = 0\n        WHERE department_members.department_id = :department_id\n          AND department_members.is_active = 1\n          AND users.tenant_id = :tenant_id\n          AND users.role IN ('customer_admin','agent')\n          AND users.is_active = 1\n        GROUP BY users.id, users.name, users.email, users.last_seen_at, users.availability_status,\n                 department_members.department_id, department_members.max_active_conversations,\n                 department_members.routing_weight, department_members.last_assigned_at\n        HAVING active_conversation_count < department_members.max_active_conversations\n    ");
    $stmt->execute([
        ':site_id' => (int) $department['site_id'],
        ':department_id' => (int) $department['id'],
        ':tenant_id' => (int) $department['tenant_id'],
    ]);

    $agents = $stmt->fetchAll();
    if ($onlineOnly) {
        $agents = array_values(array_filter($agents, static function (array $agent): bool {
            return routing_agent_is_online($agent['last_seen_at'] ?? null, $agent['availability_status'] ?? null);
        }));
    }

    $strategy = $department['routing_strategy'] ?? 'round_robin';
    usort($agents, static function (array $a, array $b) use ($strategy): int {
        $loadA = (int) $a['active_conversation_count'];
        $loadB = (int) $b['active_conversation_count'];
        $maxA = max(1, (int) $a['max_active_conversations']);
        $maxB = max(1, (int) $b['max_active_conversations']);
        $weightA = max(1, (int) ($a['routing_weight'] ?? 1));
        $weightB = max(1, (int) ($b['routing_weight'] ?? 1));

        if ($strategy === 'least_busy') {
            $ratioCompare = ($loadA / ($maxA * $weightA)) <=> ($loadB / ($maxB * $weightB));
            if ($ratioCompare !== 0) return $ratioCompare;
            if ($loadA !== $loadB) return $loadA <=> $loadB;
        }

        $timeA = empty($a['last_assigned_at']) ? 0 : (strtotime($a['last_assigned_at']) ?: 0);
        $timeB = empty($b['last_assigned_at']) ? 0 : (strtotime($b['last_assigned_at']) ?: 0);
        if ($timeA !== $timeB) return $timeA <=> $timeB;

        $weightedLoadCompare = ($loadA / $weightA) <=> ($loadB / $weightB);
        if ($weightedLoadCompare !== 0) return $weightedLoadCompare;

        return ((int) $a['id']) <=> ((int) $b['id']);
    });

    return $agents;
}

function routing_log_assignment(
    PDO $pdo,
    int $conversationId,
    ?int $departmentId,
    ?int $fromAgentId,
    ?int $toAgentId,
    string $action,
    ?string $method,
    ?int $actorUserId = null,
    ?string $note = null
): void {
    $stmt = $pdo->prepare("\n        INSERT INTO conversation_assignment_logs (\n            conversation_id, department_id, from_agent_id, to_agent_id,\n            action, assignment_method, actor_user_id, note\n        ) VALUES (\n            :conversation_id, :department_id, :from_agent_id, :to_agent_id,\n            :action, :assignment_method, :actor_user_id, :note\n        )\n    ");
    $stmt->execute([
        ':conversation_id' => $conversationId,
        ':department_id' => $departmentId,
        ':from_agent_id' => $fromAgentId,
        ':to_agent_id' => $toAgentId,
        ':action' => $action,
        ':assignment_method' => $method,
        ':actor_user_id' => $actorUserId,
        ':note' => $note,
    ]);
}

function routing_reindex_queue(PDO $pdo, int $departmentId): void
{
    $stmt = $pdo->prepare("\n        SELECT id\n        FROM conversations\n        WHERE department_id = :department_id\n          AND queue_status = 'waiting'\n          AND status <> 'closed'\n        ORDER BY queued_at ASC, id ASC\n    ");
    $stmt->execute([':department_id' => $departmentId]);

    $update = $pdo->prepare("UPDATE conversations SET queue_position = :position WHERE id = :id");
    $position = 1;
    foreach ($stmt->fetchAll() as $row) {
        $update->execute([':position' => $position++, ':id' => (int) $row['id']]);
    }
}

function routing_queue_conversation(PDO $pdo, int $conversationId, array $department, ?int $actorUserId = null, string $action = 'queued'): array
{
    // Serialize queue-position allocation per department to avoid duplicate positions.
    $departmentLock = $pdo->prepare("SELECT id FROM departments WHERE id = :department_id FOR UPDATE");
    $departmentLock->execute([':department_id' => (int) $department['id']]);

    $positionStmt = $pdo->prepare("\n        SELECT COALESCE(MAX(queue_position), 0) + 1\n        FROM conversations\n        WHERE department_id = :department_id\n          AND queue_status = 'waiting'\n          AND status <> 'closed'\n    ");
    $positionStmt->execute([':department_id' => (int) $department['id']]);
    $position = max(1, (int) $positionStmt->fetchColumn());

    $update = $pdo->prepare("\n        UPDATE conversations\n        SET department_id = :department_id, assigned_agent_id = NULL,\n            queue_status = 'waiting', queue_position = :queue_position, queued_at = COALESCE(queued_at, NOW()),\n            assigned_at = NULL, assignment_method = NULL,\n            status = CASE WHEN status = 'new' THEN 'pending' ELSE status END\n        WHERE id = :conversation_id\n    ");
    $update->execute([
        ':department_id' => (int) $department['id'],
        ':queue_position' => $position,
        ':conversation_id' => $conversationId,
    ]);

    routing_log_assignment(
        $pdo,
        $conversationId,
        (int) $department['id'],
        null,
        null,
        $action,
        'system',
        $actorUserId,
        $department['queue_message'] ?? null
    );

    return ['assigned' => false, 'queue_status' => 'waiting', 'queue_position' => $position, 'agent' => null];
}

function routing_assign_conversation(
    PDO $pdo,
    int $conversationId,
    array $department,
    array $agent,
    string $method,
    ?int $actorUserId = null,
    string $action = 'auto_assigned'
): array {
    $currentStmt = $pdo->prepare("SELECT assigned_agent_id FROM conversations WHERE id = :id LIMIT 1 FOR UPDATE");
    $currentStmt->execute([':id' => $conversationId]);
    $fromAgentId = $currentStmt->fetchColumn();
    $fromAgentId = $fromAgentId !== false && $fromAgentId !== null ? (int) $fromAgentId : null;

    $update = $pdo->prepare("\n        UPDATE conversations\n        SET department_id = :department_id, assigned_agent_id = :agent_id,\n            queue_status = 'assigned', queue_position = NULL, queued_at = NULL,\n            assigned_at = NOW(), assignment_method = :assignment_method,\n            status = CASE WHEN status IN ('new','pending') THEN 'in_progress' ELSE status END\n        WHERE id = :conversation_id\n    ");
    $update->execute([
        ':department_id' => (int) $department['id'],
        ':agent_id' => (int) $agent['id'],
        ':assignment_method' => $method,
        ':conversation_id' => $conversationId,
    ]);

    $memberStmt = $pdo->prepare("\n        UPDATE department_members\n        SET last_assigned_at = NOW()\n        WHERE department_id = :department_id AND user_id = :user_id\n    ");
    $memberStmt->execute([
        ':department_id' => (int) $department['id'],
        ':user_id' => (int) $agent['id'],
    ]);

    routing_log_assignment(
        $pdo,
        $conversationId,
        (int) $department['id'],
        $fromAgentId,
        (int) $agent['id'],
        $action,
        $method,
        $actorUserId
    );
    routing_reindex_queue($pdo, (int) $department['id']);

    return [
        'assigned' => true,
        'queue_status' => 'assigned',
        'queue_position' => null,
        'agent' => ['id' => (int) $agent['id'], 'name' => $agent['name'], 'email' => $agent['email'] ?? null],
    ];
}

function routing_route_conversation(PDO $pdo, int $conversationId, array $department, ?int $actorUserId = null): array
{
    $strategy = in_array($department['routing_strategy'] ?? '', routing_allowed_strategies(), true)
        ? $department['routing_strategy']
        : 'manual';

    if ($strategy !== 'manual') {
        $candidates = routing_candidate_agents($pdo, $department, true);
        if ($candidates) {
            return routing_assign_conversation($pdo, $conversationId, $department, $candidates[0], $strategy, $actorUserId);
        }
    }

    if ((int) ($department['queue_enabled'] ?? 1) === 1) {
        return routing_queue_conversation($pdo, $conversationId, $department, $actorUserId);
    }

    $stmt = $pdo->prepare("\n        UPDATE conversations\n        SET department_id = :department_id, assigned_agent_id = NULL,\n            queue_status = 'none', queue_position = NULL, queued_at = NULL,\n            assigned_at = NULL, assignment_method = NULL\n        WHERE id = :conversation_id\n    ");
    $stmt->execute([
        ':department_id' => (int) $department['id'],
        ':conversation_id' => $conversationId,
    ]);

    return ['assigned' => false, 'queue_status' => 'none', 'queue_position' => null, 'agent' => null];
}

function routing_process_department_queue(PDO $pdo, array $department, int $limit = 10, ?int $actorUserId = null): array
{
    $processed = 0;
    $assigned = 0;

    for ($i = 0; $i < max(1, min(50, $limit)); $i++) {
        $pdo->beginTransaction();
        try {
            $queueStmt = $pdo->prepare("\n                SELECT id\n                FROM conversations\n                WHERE department_id = :department_id\n                  AND queue_status = 'waiting'\n                  AND status <> 'closed'\n                ORDER BY queue_position ASC, queued_at ASC, id ASC\n                LIMIT 1\n                FOR UPDATE\n            ");
            $queueStmt->execute([':department_id' => (int) $department['id']]);
            $conversationId = $queueStmt->fetchColumn();

            if (!$conversationId) {
                $pdo->commit();
                break;
            }

            $processed++;
            $candidates = routing_candidate_agents($pdo, $department, true);
            if (!$candidates) {
                $pdo->commit();
                break;
            }

            routing_assign_conversation(
                $pdo,
                (int) $conversationId,
                $department,
                $candidates[0],
                $department['routing_strategy'],
                $actorUserId,
                'queue_reassigned'
            );
            $assigned++;
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    return ['processed' => $processed, 'assigned' => $assigned];
}

function routing_process_queues_for_user(PDO $pdo, int $userId, int $tenantId, int $limitPerDepartment = 3): array
{
    $stmt = $pdo->prepare("\n        SELECT departments.*\n        FROM department_members\n        INNER JOIN departments ON departments.id = department_members.department_id\n        INNER JOIN users ON users.id = department_members.user_id\n        WHERE department_members.user_id = :user_id\n          AND department_members.is_active = 1\n          AND departments.tenant_id = :tenant_id\n          AND departments.is_active = 1\n          AND departments.routing_strategy <> 'manual'\n          AND users.is_active = 1\n    ");
    $stmt->execute([':user_id' => $userId, ':tenant_id' => $tenantId]);

    $total = ['processed' => 0, 'assigned' => 0];
    foreach ($stmt->fetchAll() as $department) {
        $result = routing_process_department_queue($pdo, $department, $limitPerDepartment, $userId);
        $total['processed'] += $result['processed'];
        $total['assigned'] += $result['assigned'];
    }
    return $total;
}
