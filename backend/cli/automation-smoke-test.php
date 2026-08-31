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
    SELECT conversations.id, conversations.site_id, conversations.visitor_id, conversations.status, sites.tenant_id
    FROM conversations
    INNER JOIN sites ON sites.id = conversations.site_id
    ORDER BY conversations.id DESC
    LIMIT 1
")->fetch();

if (!$conversation) {
    fwrite(STDERR, "Automation smoke test requires at least one conversation fixture.\n");
    exit(1);
}

$marker = 'automation-smoke-' . bin2hex(random_bytes(6));

try {
    $pdo->beginTransaction();
    $fixtureStmt = $pdo->prepare("
        INSERT INTO conversations (site_id, visitor_id, status, priority, last_message_at, created_at)
        VALUES (:site_id, :visitor_id, 'open', 'normal', NOW(), NOW())
    ");
    $fixtureStmt->execute([
        ':site_id' => (int) $conversation['site_id'],
        ':visitor_id' => (int) $conversation['visitor_id'],
    ]);
    $conversation['id'] = (int) $pdo->lastInsertId();
    $conversation['status'] = 'open';
    $fixtureStmt->execute([
        ':site_id' => (int) $conversation['site_id'],
        ':visitor_id' => (int) $conversation['visitor_id'],
    ]);
    $secondConversationId = (int) $pdo->lastInsertId();

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
    $secondSummary = automation_dispatch_event(
        $pdo,
        'visitor_message',
        $secondConversationId,
        ['message_text' => 'same event key on another conversation'],
        null,
        $marker
    );

    $messageStmt = $pdo->prepare("SELECT COUNT(*) FROM messages WHERE conversation_id = :conversation_id AND content = :content AND message_type = 'internal_note'");
    $messageStmt->execute([':conversation_id' => (int) $conversation['id'], ':content' => $marker]);
    $messageCount = (int) $messageStmt->fetchColumn();
    $messageStmt->execute([':conversation_id' => $secondConversationId, ':content' => $marker]);
    $secondMessageCount = (int) $messageStmt->fetchColumn();

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
            use_business_hours, pause_statuses_json,
            warning_before_minutes, breach_priority, is_default, is_active
        ) VALUES (
            :tenant_id, :site_id, :effective_from, :name, 10, 60,
            1, :pause_statuses_json, 3, 'urgent', 1, 1
        )
    ");
    $slaPolicyStmt->execute([
        ':tenant_id' => (int) $conversation['tenant_id'],
        ':site_id' => (int) $conversation['site_id'],
        ':effective_from' => '1970-01-01 00:00:00',
        ':name' => 'Automation smoke SLA',
        ':pause_statuses_json' => automation_json(['waiting_customer']),
    ]);
    $slaPolicyId = (int) $pdo->lastInsertId();

    $calendarTimezone = hosted_support_site_timezone($pdo, (int) $conversation['site_id']);
    $calendarStart = new DateTimeImmutable('2037-04-06 17:50:00', automation_sla_timezone($calendarTimezone));
    $calendarException = $pdo->prepare("
        INSERT INTO site_schedule_exceptions (site_id, exception_date, title, is_closed, open_time, close_time)
        VALUES (:site_id, :exception_date, :title, :is_closed, :open_time, :close_time)
        ON DUPLICATE KEY UPDATE title = VALUES(title), is_closed = VALUES(is_closed),
            open_time = VALUES(open_time), close_time = VALUES(close_time)
    ");
    foreach ([
        [$calendarStart, 0, '09:00:00', '18:00:00'],
        [$calendarStart->modify('+1 day'), 1, null, null],
        [$calendarStart->modify('+2 days'), 0, '09:00:00', '18:00:00'],
    ] as [$date, $isClosed, $openTime, $closeTime]) {
        $calendarException->execute([
            ':site_id' => (int) $conversation['site_id'],
            ':exception_date' => $date->format('Y-m-d'),
            ':title' => 'Automation SLA smoke calendar',
            ':is_closed' => $isClosed,
            ':open_time' => $openTime,
            ':close_time' => $closeTime,
        ]);
    }
    $calendarDue = automation_sla_add_business_seconds(
        $pdo,
        (int) $conversation['site_id'],
        $calendarStart,
        20 * 60,
        $calendarTimezone
    );
    $expectedCalendarDue = $calendarStart->modify('+2 days')->setTime(9, 10, 0);
    if ($calendarDue->getTimestamp() !== $expectedCalendarDue->getTimestamp()) {
        throw new RuntimeException('Business calendar assertion failed: expected ' . $expectedCalendarDue->format(DateTimeInterface::ATOM) . ', got ' . $calendarDue->format(DateTimeInterface::ATOM));
    }

    $openClock = automation_sla_clock_state(
        $pdo,
        (int) $conversation['site_id'],
        $calendarStart,
        $calendarTimezone
    );
    $closedClock = automation_sla_clock_state(
        $pdo,
        (int) $conversation['site_id'],
        $calendarStart->setTime(18, 0, 0),
        $calendarTimezone
    );
    $expectedClose = $calendarStart->setTime(18, 0, 0);
    $expectedReopen = $calendarStart->modify('+2 days')->setTime(9, 0, 0);
    if (empty($openClock['running'])
        || !($openClock['next_transition_at'] instanceof DateTimeImmutable)
        || $openClock['next_transition_at']->getTimestamp() !== $expectedClose->getTimestamp()
        || !empty($closedClock['running'])
        || !($closedClock['next_open_at'] instanceof DateTimeImmutable)
        || !($closedClock['next_transition_at'] instanceof DateTimeImmutable)
        || $closedClock['next_open_at']->getTimestamp() !== $expectedReopen->getTimestamp()
        || $closedClock['next_transition_at']->getTimestamp() !== $expectedReopen->getTimestamp()) {
        throw new RuntimeException('Business calendar clock-transition assertion failed.');
    }

    $pdo->prepare("DELETE FROM conversation_sla_status WHERE conversation_id = :conversation_id")
        ->execute([':conversation_id' => (int) $conversation['id']]);
    automation_attach_sla($pdo, (int) $conversation['id']);
    $slaStatusStmt = $pdo->prepare("SELECT policy_id, uses_business_hours, sla_timezone, pause_statuses_json, first_response_due_at, resolution_due_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $slaStatusStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $slaStatus = $slaStatusStmt->fetch();
    $agentMessageStmt = $pdo->prepare("
        INSERT INTO messages (conversation_id, sender_type, message_type, sender_id, content, is_read, created_at)
        VALUES (:conversation_id, 'agent', :message_type, NULL, :content, 1, :created_at)
    ");
    $agentMessageStmt->execute([
        ':conversation_id' => (int) $conversation['id'],
        ':message_type' => 'internal_note',
        ':content' => 'SLA smoke internal note',
        ':created_at' => date('Y-m-d H:i:s', time() - 120),
    ]);
    $expectedFirstResponseAt = date('Y-m-d H:i:s', time() - 60);
    $agentMessageStmt->execute([
        ':conversation_id' => (int) $conversation['id'],
        ':message_type' => 'text',
        ':content' => 'SLA smoke public response',
        ':created_at' => $expectedFirstResponseAt,
    ]);
    automation_mark_first_response($pdo, (int) $conversation['id']);
    $firstResponseAt = $pdo->prepare("SELECT first_response_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $firstResponseAt->execute([':conversation_id' => (int) $conversation['id']]);
    $slaFirstResponseAt = $firstResponseAt->fetchColumn();
    automation_sync_sla_status($pdo, (int) $conversation['id'], 'waiting_customer');
    $pausedStmt = $pdo->prepare("SELECT paused_at, paused_status, resolution_remaining_seconds FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $pausedStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $pausedSla = $pausedStmt->fetch();
    automation_sync_sla_status($pdo, (int) $conversation['id'], (string) $conversation['status']);
    $resumedStmt = $pdo->prepare("SELECT paused_at, paused_status, resolution_remaining_seconds, total_paused_seconds FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $resumedStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $resumedSla = $resumedStmt->fetch();

    $pdo->prepare("UPDATE automation_rules SET is_active = 0 WHERE id = :id")
        ->execute([':id' => $ruleId]);
    $replyRuleStmt = $pdo->prepare("
        INSERT INTO automation_rules (
            tenant_id, site_id, name, trigger_type, match_type, conditions_json,
            actions_json, is_active, priority, cooldown_seconds, stop_processing
        ) VALUES (
            :tenant_id, :site_id, :name, 'visitor_message', 'all', :conditions_json,
            :actions_json, 1, 1, 0, 1
        )
    ");
    $replyRuleStmt->execute([
        ':tenant_id' => (int) $conversation['tenant_id'],
        ':site_id' => (int) $conversation['site_id'],
        ':name' => 'Automation smoke customer reply',
        ':conditions_json' => automation_json([[
            'field' => 'conversation.status',
            'operator' => 'equals',
            'value' => 'waiting_customer',
        ]]),
        ':actions_json' => automation_json([['type' => 'set_status', 'value' => 'in_progress']]),
    ]);
    $pdo->prepare("UPDATE conversations SET status = 'waiting_customer' WHERE id = :id")
        ->execute([':id' => (int) $conversation['id']]);
    automation_sync_sla_status($pdo, (int) $conversation['id'], 'waiting_customer');
    $customerReplySummary = automation_dispatch_event(
        $pdo,
        'visitor_message',
        (int) $conversation['id'],
        ['message_text' => 'customer replied while waiting'],
        null,
        'customer-reply-sequence'
    );
    $fallbackResumeStmt = $pdo->prepare("UPDATE conversations SET status = 'open' WHERE id = :id AND status = 'waiting_customer'");
    $fallbackResumeStmt->execute([':id' => (int) $conversation['id']]);
    $replyStateStmt = $pdo->prepare("SELECT conversations.status, conversation_sla_status.paused_at FROM conversations INNER JOIN conversation_sla_status ON conversation_sla_status.conversation_id = conversations.id WHERE conversations.id = :id");
    $replyStateStmt->execute([':id' => (int) $conversation['id']]);
    $replyState = $replyStateStmt->fetch();

    automation_sync_sla_status($pdo, (int) $conversation['id'], 'closed');
    $closedStmt = $pdo->prepare("SELECT state, resolved_at, resolution_remaining_seconds FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $closedStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $closedSla = $closedStmt->fetch();
    automation_sync_sla_status($pdo, (int) $conversation['id'], 'open');
    $reopenedStmt = $pdo->prepare("SELECT state, resolved_at, resolution_remaining_seconds, resolution_due_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $reopenedStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $reopenedSla = $reopenedStmt->fetch();
    $slaSnapshot = automation_get_sla_snapshot($pdo, (int) $conversation['id']);

    automation_attach_sla($pdo, $secondConversationId);
    automation_mark_first_response($pdo, $secondConversationId);
    $pdo->prepare("UPDATE conversation_sla_status SET uses_business_hours = 0, state = 'met', resolution_due_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE), resolution_warning_sent_at = NULL, resolution_breached_at = NULL, last_checked_at = NULL WHERE conversation_id = :conversation_id")
        ->execute([':conversation_id' => $secondConversationId]);
    $alertCountStmt = $pdo->prepare("SELECT COUNT(*) FROM automation_alerts WHERE conversation_id = :conversation_id AND title = :title");
    automation_run_scheduled($pdo, 1000, (int) $conversation['tenant_id']);
    $alertCountStmt->execute([':conversation_id' => $secondConversationId, ':title' => 'SLA حل گفتگو در آستانه نقض']);
    $warningAlertCount = (int) $alertCountStmt->fetchColumn();
    automation_run_scheduled($pdo, 1000, (int) $conversation['tenant_id']);
    $alertCountStmt->execute([':conversation_id' => $secondConversationId, ':title' => 'SLA حل گفتگو در آستانه نقض']);
    $warningAlertCountAfterRetry = (int) $alertCountStmt->fetchColumn();

    $pdo->prepare("UPDATE conversation_sla_status SET state = 'met', resolution_due_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE), resolution_breached_at = NULL, last_checked_at = NULL WHERE conversation_id = :conversation_id")
        ->execute([':conversation_id' => $secondConversationId]);
    automation_run_scheduled($pdo, 1000, (int) $conversation['tenant_id']);
    $alertCountStmt->execute([':conversation_id' => $secondConversationId, ':title' => 'SLA حل گفتگو نقض شد']);
    $breachAlertCount = (int) $alertCountStmt->fetchColumn();
    automation_run_scheduled($pdo, 1000, (int) $conversation['tenant_id']);
    $alertCountStmt->execute([':conversation_id' => $secondConversationId, ':title' => 'SLA حل گفتگو نقض شد']);
    $breachAlertCountAfterRetry = (int) $alertCountStmt->fetchColumn();
    $workerSlaStmt = $pdo->prepare("SELECT resolution_warning_sent_at, resolution_breached_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $workerSlaStmt->execute([':conversation_id' => $secondConversationId]);
    $workerSla = $workerSlaStmt->fetch();

    $pdo->prepare("UPDATE conversation_sla_status SET uses_business_hours = 0, state = 'met', resolved_at = NULL, resolution_due_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE), resolution_breached_at = NULL, resolution_remaining_seconds = NULL WHERE conversation_id = :conversation_id")
        ->execute([':conversation_id' => (int) $conversation['id']]);
    automation_sync_sla_status($pdo, (int) $conversation['id'], 'closed');
    $overdueClosedStmt = $pdo->prepare("SELECT state, resolved_at, resolution_breached_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $overdueClosedStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $overdueClosedSla = $overdueClosedStmt->fetch();
    automation_sync_sla_status($pdo, (int) $conversation['id'], 'closed');
    $overdueClosedStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $idempotentClosedSla = $overdueClosedStmt->fetch();
    automation_sync_sla_status($pdo, (int) $conversation['id'], 'open');
    $overdueReopenStmt = $pdo->prepare("SELECT state, resolved_at, resolution_breached_at FROM conversation_sla_status WHERE conversation_id = :conversation_id");
    $overdueReopenStmt->execute([':conversation_id' => (int) $conversation['id']]);
    $overdueReopenedSla = $overdueReopenStmt->fetch();

    if (($summary['executed'] ?? 0) < 1 || ($secondSummary['executed'] ?? 0) < 1
        || $messageCount !== 1 || $secondMessageCount !== 1 || $logStatus !== 'success' || empty($preview['matched'])
        || !$slaStatus || (int) $slaStatus['policy_id'] !== $slaPolicyId || (int) $slaStatus['uses_business_hours'] !== 1
        || automation_decode_list($slaStatus['pause_statuses_json'] ?? null) !== ['waiting_customer'] || $slaFirstResponseAt !== $expectedFirstResponseAt
        || !$pausedSla || empty($pausedSla['paused_at']) || $pausedSla['paused_status'] !== 'waiting_customer'
        || !$resumedSla || $resumedSla['paused_at'] !== null || $resumedSla['resolution_remaining_seconds'] !== null
        || ($customerReplySummary['executed'] ?? 0) !== 1 || $fallbackResumeStmt->rowCount() !== 0
        || !$replyState || $replyState['status'] !== 'in_progress' || $replyState['paused_at'] !== null
        || !$closedSla || $closedSla['state'] !== 'resolved' || empty($closedSla['resolved_at']) || (int) $closedSla['resolution_remaining_seconds'] <= 0
        || !$reopenedSla || $reopenedSla['state'] === 'resolved' || $reopenedSla['resolved_at'] !== null || $reopenedSla['resolution_remaining_seconds'] !== null
        || !$slaSnapshot || !array_key_exists('remaining_seconds', $slaSnapshot) || !array_key_exists('clock_running', $slaSnapshot) || !array_key_exists('next_transition_at', $slaSnapshot)
        || !$workerSla || empty($workerSla['resolution_warning_sent_at']) || empty($workerSla['resolution_breached_at'])
        || $warningAlertCount <= 0 || $warningAlertCountAfterRetry !== $warningAlertCount
        || $breachAlertCount <= 0 || $breachAlertCountAfterRetry !== $breachAlertCount
        || !$overdueClosedSla || $overdueClosedSla['state'] !== 'resolved' || empty($overdueClosedSla['resolution_breached_at'])
        || !$idempotentClosedSla || $idempotentClosedSla['resolution_breached_at'] !== $overdueClosedSla['resolution_breached_at']
        || !$overdueReopenedSla || $overdueReopenedSla['state'] !== 'breached' || $overdueReopenedSla['resolved_at'] !== null) {
        throw new RuntimeException('Automation assertions failed: ' . json_encode([
            'summary' => $summary,
            'second_summary' => $secondSummary,
            'message_count' => $messageCount,
            'second_message_count' => $secondMessageCount,
            'log_status' => $logStatus,
            'preview_matched' => $preview['matched'] ?? null,
            'sla_policy_id' => $slaStatus['policy_id'] ?? null,
            'sla_first_response_at' => $slaFirstResponseAt ?: null,
            'sla_paused' => $pausedSla,
            'sla_resumed' => $resumedSla,
            'customer_reply_summary' => $customerReplySummary,
            'customer_reply_state' => $replyState,
            'sla_closed' => $closedSla,
            'sla_reopened' => $reopenedSla,
            'sla_snapshot' => $slaSnapshot,
            'worker_sla' => $workerSla,
            'worker_warning_alert_counts' => [$warningAlertCount, $warningAlertCountAfterRetry],
            'worker_breach_alert_counts' => [$breachAlertCount, $breachAlertCountAfterRetry],
            'sla_overdue_closed' => $overdueClosedSla,
            'sla_overdue_reopened' => $overdueReopenedSla,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    $pdo->rollBack();
    echo json_encode([
        'success' => true,
        'conversation_id' => (int) $conversation['id'],
        'dispatch' => $summary,
        'message_action' => 'passed',
        'execution_log' => 'passed',
        'event_key_conversation_isolation' => 'passed',
        'rule_preview' => 'passed',
        'sla_tracking' => 'passed',
        'sla_business_calendar' => 'passed',
        'sla_pause_resume' => 'passed',
        'customer_reply_rule_sequence' => 'passed',
        'sla_close_reopen' => 'passed',
        'sla_overdue_close' => 'passed',
        'sla_worker_idempotency' => 'passed',
        'sla_live_snapshot' => 'passed',
        'database_changes' => 'rolled_back',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, 'Automation smoke test failed at ' . basename($e->getFile()) . ':' . $e->getLine() . ': ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
