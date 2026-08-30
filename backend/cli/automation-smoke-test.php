<?php

declare(strict_types=1);

// Transactional smoke test: no test rule, message or log remains in the database.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/automation.php';

$conversation = $pdo->query("
    SELECT conversations.id, conversations.site_id, conversations.status, sites.tenant_id
    FROM conversations
    INNER JOIN sites ON sites.id = conversations.site_id
    ORDER BY conversations.id DESC
    LIMIT 1
")->fetch();

if (!$conversation) {
    echo "Automation smoke test skipped: no conversation is available.\n";
    exit(0);
}

$marker = 'automation-smoke-' . bin2hex(random_bytes(6));

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("
        INSERT INTO automation_rules (
            tenant_id, site_id, name, trigger_type, match_type, conditions_json,
            actions_json, is_active, priority, cooldown_seconds, stop_processing
        ) VALUES (
            :tenant_id, :site_id, :name, 'visitor_message', 'all', '[]',
            :actions_json, 1, 1, 0, 1
        )
    ");
    $stmt->execute([
        ':tenant_id' => (int) $conversation['tenant_id'],
        ':site_id' => (int) $conversation['site_id'],
        ':name' => 'Automation smoke test',
        ':actions_json' => automation_json([['type' => 'add_internal_note', 'message' => $marker]]),
    ]);
    $ruleId = (int) $pdo->lastInsertId();

    $summary = automation_dispatch_event(
        $pdo,
        'visitor_message',
        (int) $conversation['id'],
        ['message_text' => 'smoke test'],
        null,
        $marker
    );

    $messageStmt = $pdo->prepare("SELECT COUNT(*) FROM messages WHERE conversation_id = :conversation_id AND content = :content AND message_type = 'internal_note'");
    $messageStmt->execute([':conversation_id' => (int) $conversation['id'], ':content' => $marker]);
    $messageCount = (int) $messageStmt->fetchColumn();

    $logStmt = $pdo->prepare("SELECT status FROM automation_execution_logs WHERE rule_id = :rule_id ORDER BY id DESC LIMIT 1");
    $logStmt->execute([':rule_id' => $ruleId]);
    $logStatus = (string) ($logStmt->fetchColumn() ?: '');

    $preview = automation_preview_rule($pdo, (int) $conversation['tenant_id'], (int) $conversation['id'], [
        'match_type' => 'all',
        'conditions' => [[
            'field' => 'conversation.status',
            'operator' => 'equals',
            'value' => (string) $conversation['status'],
        ]],
    ]);

    $pdo->prepare("UPDATE automation_sla_policies SET is_active = 0 WHERE tenant_id = :tenant_id")
        ->execute([':tenant_id' => (int) $conversation['tenant_id']]);
    $slaPolicyStmt = $pdo->prepare("
        INSERT INTO automation_sla_policies (
            tenant_id, site_id, effective_from, name, first_response_minutes, resolution_minutes,
            warning_before_minutes, breach_priority, is_default, is_active
        ) VALUES (
            :tenant_id, :site_id, :effective_from, :name, 10, 60, 3, 'urgent', 1, 1
        )
    ");
    $slaPolicyStmt->execute([
        ':tenant_id' => (int) $conversation['tenant_id'],
        ':site_id' => (int) $conversation['site_id'],
        ':effective_from' => '1970-01-01 00:00:00',
        ':name' => 'Automation smoke SLA',
    ]);
    $slaPolicyId = (int) $pdo->lastInsertId();
    $pdo->prepare("DELETE FROM conversation_sla_status WHERE conversation_id = :conversation_id")
        ->execute([':conversation_id' => (int) $conversation['id']]);
    automation_attach_sla($pdo, (int) $conversation['id']);
    $slaStatusStmt = $pdo->prepare("SELECT policy_id, first_response_due_at, resolution_due_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $slaStatusStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $slaStatus = $slaStatusStmt->fetch();
    automation_mark_first_response($pdo, (int) $conversation['id']);
    $firstResponseAt = $pdo->prepare("SELECT first_response_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $firstResponseAt->execute([':conversation_id' => (int) $conversation['id']]);
    $slaFirstResponseAt = $firstResponseAt->fetchColumn();

    if (($summary['executed'] ?? 0) < 1 || $messageCount !== 1 || $logStatus !== 'success' || empty($preview['matched'])
        || !$slaStatus || (int) $slaStatus['policy_id'] !== $slaPolicyId || !$slaFirstResponseAt) {
        throw new RuntimeException('Automation assertions failed: ' . json_encode([
            'summary' => $summary,
            'message_count' => $messageCount,
            'log_status' => $logStatus,
            'preview_matched' => $preview['matched'] ?? null,
            'sla_policy_id' => $slaStatus['policy_id'] ?? null,
            'sla_first_response_at' => $slaFirstResponseAt ?: null,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    $pdo->rollBack();
    echo json_encode([
        'success' => true,
        'conversation_id' => (int) $conversation['id'],
        'dispatch' => $summary,
        'message_action' => 'passed',
        'execution_log' => 'passed',
        'rule_preview' => 'passed',
        'sla_tracking' => 'passed',
        'database_changes' => 'rolled_back',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, 'Automation smoke test failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
