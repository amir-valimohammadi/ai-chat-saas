<?php

declare(strict_types=1);

// Attach the currently effective SLA policy to historical, still-open conversations.
// The SLA clocks start at the beginning of this run, so old rows never breach retroactively.
// Usage:
//   php backend/cli/backfill-automation-sla.php <tenant-id>
//   php backend/cli/backfill-automation-sla.php <tenant-id> --apply [--batch-size=100]

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/automation.php';

$tenantId = max(0, (int) ($argv[1] ?? 0));
$apply = in_array('--apply', $argv, true);
$batchSize = 100;
foreach (array_slice($argv, 2) as $argument) {
    if (preg_match('/^--batch-size=(\d+)$/', (string) $argument, $matches)) {
        $batchSize = max(1, min(500, (int) $matches[1]));
    }
}

if ($tenantId <= 0) {
    fwrite(STDERR, "Usage: php backend/cli/backfill-automation-sla.php <tenant-id> [--apply] [--batch-size=100]\n");
    exit(1);
}
if (!automation_tables_ready($pdo)) {
    fwrite(STDERR, "Automation tables are not installed. Run the automation migrations first.\n");
    exit(1);
}

$tenantStmt = $pdo->prepare("SELECT id, name FROM tenants WHERE id = :id AND status = 'active' LIMIT 1");
$tenantStmt->execute([':id' => $tenantId]);
$tenant = $tenantStmt->fetch();
if (!$tenant) {
    fwrite(STDERR, "Active tenant not found.\n");
    exit(1);
}

$runStartedAt = new DateTimeImmutable('now', automation_sla_storage_timezone());
$runStartedAtStorage = automation_sla_format_storage($runStartedAt);
$openStatuses = ['new', 'open', 'in_progress', 'waiting_customer', 'follow_up', 'pending'];
$summary = [
    'success' => true,
    'mode' => $apply ? 'apply' : 'dry-run',
    'tenant_id' => $tenantId,
    'tenant_name' => $tenant['name'],
    'started_at' => $runStartedAt->format(DateTimeInterface::ATOM),
    'candidates' => 0,
    'inserted' => 0,
    'skipped_existing' => 0,
    'skipped_closed' => 0,
    'skipped_no_policy' => 0,
    'paused' => 0,
    'historical_first_response' => 0,
    'calendar_fallbacks' => 0,
    'failures' => 0,
    'failure_details' => [],
];

$candidateSql = "
    SELECT conversations.id
    FROM conversations
    INNER JOIN sites ON sites.id = conversations.site_id
    LEFT JOIN conversation_sla_status ON conversation_sla_status.conversation_id = conversations.id
    WHERE sites.tenant_id = :tenant_id
      AND conversations.status IN ('new','open','in_progress','waiting_customer','follow_up','pending')
      AND conversation_sla_status.conversation_id IS NULL
      AND conversations.id > :after_id
    ORDER BY conversations.id ASC
    LIMIT {$batchSize}
";
$candidateStmt = $pdo->prepare($candidateSql);
$conversationStmt = $pdo->prepare("
    SELECT conversations.id, conversations.site_id, conversations.status, sites.tenant_id
    FROM conversations
    INNER JOIN sites ON sites.id = conversations.site_id
    WHERE conversations.id = :conversation_id AND sites.tenant_id = :tenant_id
    LIMIT 1
    FOR UPDATE
");
$existingStmt = $pdo->prepare("
    SELECT conversation_id
    FROM conversation_sla_status
    WHERE conversation_id = :conversation_id
    LIMIT 1
    FOR UPDATE
");
$policyStmt = $pdo->prepare("
    SELECT *
    FROM automation_sla_policies
    WHERE tenant_id = :tenant_id
      AND (site_id = :site_id OR site_id IS NULL)
      AND is_active = 1
      AND effective_from <= :effective_at
    ORDER BY (site_id IS NOT NULL) DESC, is_default DESC, id ASC
    LIMIT 1
    FOR UPDATE
");
$previewPolicyStmt = $pdo->prepare("
    SELECT id
    FROM automation_sla_policies
    WHERE tenant_id = :tenant_id
      AND (site_id = :site_id OR site_id IS NULL)
      AND is_active = 1
      AND effective_from <= :effective_at
    ORDER BY (site_id IS NOT NULL) DESC, is_default DESC, id ASC
    LIMIT 1
");
$firstResponseStmt = $pdo->prepare("
    SELECT MIN(created_at)
    FROM messages
    WHERE conversation_id = :conversation_id
      AND sender_type = 'agent'
      AND message_type <> 'internal_note'
");
$insertStmt = $pdo->prepare("
    INSERT INTO conversation_sla_status (
        conversation_id, policy_id, uses_business_hours, sla_timezone, pause_statuses_json,
        state, first_response_due_at, resolution_due_at, first_response_at,
        paused_at, paused_status, resolution_remaining_seconds, total_paused_seconds
    ) VALUES (
        :conversation_id, :policy_id, :uses_business_hours, :sla_timezone, :pause_statuses_json,
        'tracking', :first_response_due_at, :resolution_due_at, :first_response_at,
        :paused_at, :paused_status, :resolution_remaining_seconds, 0
    )
");

$afterId = 0;
do {
    $candidateStmt->execute([':tenant_id' => $tenantId, ':after_id' => $afterId]);
    $candidateIds = array_map('intval', array_column($candidateStmt->fetchAll(), 'id'));
    foreach ($candidateIds as $conversationId) {
        $afterId = $conversationId;
        $summary['candidates']++;

        try {
            if (!$apply) {
                $previewStmt = $pdo->prepare("
                    SELECT conversations.site_id
                    FROM conversations
                    INNER JOIN sites ON sites.id = conversations.site_id
                    WHERE conversations.id = :conversation_id
                      AND sites.tenant_id = :tenant_id
                      AND conversations.status IN ('new','open','in_progress','waiting_customer','follow_up','pending')
                    LIMIT 1
                ");
                $previewStmt->execute([':conversation_id' => $conversationId, ':tenant_id' => $tenantId]);
                $siteId = (int) ($previewStmt->fetchColumn() ?: 0);
                if ($siteId <= 0) {
                    $summary['skipped_closed']++;
                    continue;
                }
                $previewPolicyStmt->execute([
                    ':tenant_id' => $tenantId,
                    ':site_id' => $siteId,
                    ':effective_at' => $runStartedAtStorage,
                ]);
                if (!$previewPolicyStmt->fetchColumn()) {
                    $summary['skipped_no_policy']++;
                }
                continue;
            }

            $pdo->beginTransaction();
            $conversationStmt->execute([':conversation_id' => $conversationId, ':tenant_id' => $tenantId]);
            $conversation = $conversationStmt->fetch();
            if (!$conversation || !in_array((string) $conversation['status'], $openStatuses, true)) {
                $pdo->rollBack();
                $summary['skipped_closed']++;
                continue;
            }

            $existingStmt->execute([':conversation_id' => $conversationId]);
            if ($existingStmt->fetchColumn()) {
                $pdo->rollBack();
                $summary['skipped_existing']++;
                continue;
            }

            $siteId = (int) $conversation['site_id'];
            $policyStmt->execute([
                ':tenant_id' => $tenantId,
                ':site_id' => $siteId,
                ':effective_at' => $runStartedAtStorage,
            ]);
            $policy = $policyStmt->fetch();
            if (!$policy) {
                $pdo->rollBack();
                $summary['skipped_no_policy']++;
                continue;
            }

            $timezone = hosted_support_site_timezone($pdo, $siteId);
            $usesBusinessHours = !empty($policy['use_business_hours']);
            $firstResponseSeconds = max(1, (int) $policy['first_response_minutes']) * 60;
            $resolutionSeconds = max(1, (int) $policy['resolution_minutes']) * 60;

            if ($usesBusinessHours) {
                try {
                    hosted_support_ensure_defaults($pdo, $siteId);
                    $firstResponseDue = automation_sla_add_business_seconds(
                        $pdo,
                        $siteId,
                        $runStartedAt,
                        $firstResponseSeconds,
                        $timezone
                    );
                    $resolutionDue = automation_sla_add_business_seconds(
                        $pdo,
                        $siteId,
                        $runStartedAt,
                        $resolutionSeconds,
                        $timezone
                    );
                } catch (Throwable $calendarError) {
                    $usesBusinessHours = false;
                    $summary['calendar_fallbacks']++;
                    $firstResponseDue = $runStartedAt->setTimestamp($runStartedAt->getTimestamp() + $firstResponseSeconds);
                    $resolutionDue = $runStartedAt->setTimestamp($runStartedAt->getTimestamp() + $resolutionSeconds);
                    if (function_exists('app_log_error')) {
                        app_log_error($calendarError, [
                            'component' => 'automation_sla_backfill_calendar',
                            'conversation_id' => $conversationId,
                        ]);
                    }
                }
            } else {
                $firstResponseDue = $runStartedAt->setTimestamp($runStartedAt->getTimestamp() + $firstResponseSeconds);
                $resolutionDue = $runStartedAt->setTimestamp($runStartedAt->getTimestamp() + $resolutionSeconds);
            }

            $firstResponseStmt->execute([':conversation_id' => $conversationId]);
            $historicalFirstResponse = $firstResponseStmt->fetchColumn() ?: null;
            $pauseStatuses = automation_sla_pause_statuses($policy);
            $isPaused = in_array((string) $conversation['status'], $pauseStatuses, true);

            $insertStmt->execute([
                ':conversation_id' => $conversationId,
                ':policy_id' => (int) $policy['id'],
                ':uses_business_hours' => $usesBusinessHours ? 1 : 0,
                ':sla_timezone' => $timezone,
                ':pause_statuses_json' => automation_json($pauseStatuses),
                ':first_response_due_at' => automation_sla_format_storage($firstResponseDue),
                ':resolution_due_at' => automation_sla_format_storage($resolutionDue),
                ':first_response_at' => $historicalFirstResponse,
                ':paused_at' => $isPaused ? $runStartedAtStorage : null,
                ':paused_status' => $isPaused ? (string) $conversation['status'] : null,
                ':resolution_remaining_seconds' => $isPaused ? $resolutionSeconds : null,
            ]);
            $pdo->commit();

            $summary['inserted']++;
            if ($historicalFirstResponse !== null) $summary['historical_first_response']++;
            if ($isPaused) $summary['paused']++;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $summary['success'] = false;
            $summary['failures']++;
            if (count($summary['failure_details']) < 20) {
                $summary['failure_details'][] = [
                    'conversation_id' => $conversationId,
                    'message' => $e->getMessage(),
                ];
            }
        }
    }
} while (count($candidateIds) === $batchSize);

if (!$apply) {
    $summary['note'] = 'No database rows were changed. Re-run with --apply to attach SLA tracking.';
}

echo json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
exit($summary['success'] ? 0 : 2);
