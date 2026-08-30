<?php

declare(strict_types=1);

// End-to-end HTTP smoke test for Automation Center APIs.
// It creates temporary records and removes them in finally.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth-session.php';

if (!function_exists('curl_init')) {
    fwrite(STDERR, "Automation API smoke test requires the PHP cURL extension.\n");
    exit(1);
}

$requestedTenantId = max(0, (int) ($argv[1] ?? 0));
$userSql = "
    SELECT users.*
    FROM users
    INNER JOIN tenants ON tenants.id = users.tenant_id AND tenants.status = 'active'
    WHERE users.role = 'customer_admin' AND users.is_active = 1
";
$userParams = [];
if ($requestedTenantId > 0) {
    $userSql .= ' AND users.tenant_id = :tenant_id ';
    $userParams[':tenant_id'] = $requestedTenantId;
}
$userSql .= ' ORDER BY users.id ASC LIMIT 1 ';
$userStmt = $pdo->prepare($userSql);
$userStmt->execute($userParams);
$user = $userStmt->fetch();

if (!$user) {
    echo "Automation API smoke test skipped: no active customer admin is available.\n";
    exit(0);
}

$marker = 'Automation API smoke ' . bin2hex(random_bytes(5));
$session = null;
$ruleId = 0;
$policyId = 0;
$alertId = 0;
$apiBase = rtrim((string) app_config('api_url', 'http://localhost/ai-chat-saas/backend/api'), '/');

$request = static function (string $path, string $token, ?array $payload = null) use ($apiBase): array {
    $handle = curl_init($apiBase . $path);
    $headers = [
        'Accept: application/json',
        'Authorization: Bearer ' . $token,
        'Origin: http://localhost:3000',
    ];
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        $options[CURLOPT_HTTPHEADER] = $headers;
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($handle, $options);
    $body = curl_exec($handle);
    if ($body === false) {
        $message = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('HTTP request failed: ' . $message);
    }
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    $json = json_decode((string) $body, true);
    if ($status < 200 || $status >= 300 || !is_array($json) || empty($json['success'])) {
        throw new RuntimeException("{$path} returned HTTP {$status}: " . (string) $body);
    }
    return $json;
};

$requestStream = static function (string $path, string $token) use ($apiBase): string {
    $handle = curl_init($apiBase . $path);
    $body = '';
    curl_setopt_array($handle, [
        CURLOPT_TIMEOUT_MS => 2500,
        CURLOPT_HTTPHEADER => [
            'Accept: text/event-stream',
            'Authorization: Bearer ' . $token,
            'Origin: http://localhost:3000',
        ],
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if ($status !== 200) throw new RuntimeException("{$path} stream returned HTTP {$status}.");
    return $body;
};

try {
    $session = auth_issue_session($pdo, $user);
    $token = (string) $session['token'];
    $overview = $request('/customer/automation-overview.php', $token);

    $alertStmt = $pdo->prepare("
        INSERT INTO automation_alerts (tenant_id, recipient_user_id, severity, title, message)
        VALUES (:tenant_id, :recipient_user_id, 'info', :title, :message)
    ");
    $alertStmt->execute([
        ':tenant_id' => (int) $user['tenant_id'],
        ':recipient_user_id' => (int) $user['id'],
        ':title' => $marker,
        ':message' => 'Temporary realtime alert smoke test',
    ]);
    $alertId = (int) $pdo->lastInsertId();
    $alertList = $request('/agent/automation-alerts.php', $token);
    $listedAlertIds = array_map(static fn(array $alert): int => (int) ($alert['id'] ?? 0), $alertList['alerts'] ?? []);
    if (!in_array($alertId, $listedAlertIds, true)) throw new RuntimeException('Realtime alert was not returned by the alerts API.');
    $streamBody = $requestStream('/agent/automation-alert-stream.php', $token);
    if (!str_contains($streamBody, 'event: automation.alerts') || !str_contains($streamBody, $marker)) {
        throw new RuntimeException('Automation alert stream did not deliver the temporary alert.');
    }
    $request('/agent/automation-alert-read.php', $token, ['alert_id' => $alertId]);
    $readStmt = $pdo->prepare("SELECT is_read FROM automation_alerts WHERE id = :id AND recipient_user_id = :recipient_user_id");
    $readStmt->execute([':id' => $alertId, ':recipient_user_id' => (int) $user['id']]);
    if ((int) $readStmt->fetchColumn() !== 1) throw new RuntimeException('Automation alert was not marked as read.');

    $rule = $request('/customer/automation-rule-save.php', $token, [
        'name' => $marker,
        'description' => 'Temporary API smoke rule',
        'trigger_type' => 'visitor_message',
        'match_type' => 'all',
        'conditions' => [['field' => 'event.message_text', 'operator' => 'contains', 'value' => 'smoke']],
        'actions' => [['type' => 'add_internal_note', 'message' => 'Temporary smoke note']],
        'is_active' => true,
        'priority' => 999,
        'cooldown_seconds' => 60,
    ]);
    $ruleId = (int) ($rule['rule_id'] ?? 0);
    if ($ruleId <= 0) throw new RuntimeException('Rule API did not return rule_id.');

    $request('/customer/automation-rule-toggle.php', $token, ['rule_id' => $ruleId, 'is_active' => false]);
    $request('/customer/automation-rule-toggle.php', $token, ['rule_id' => $ruleId, 'is_active' => true]);

    $conversationStmt = $pdo->prepare("
        SELECT conversations.id
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
        ORDER BY conversations.id DESC LIMIT 1
    ");
    $conversationStmt->execute([':tenant_id' => (int) $user['tenant_id']]);
    $conversationId = (int) ($conversationStmt->fetchColumn() ?: 0);
    if ($conversationId > 0) {
        $request('/customer/automation-rule-test.php', $token, [
            'conversation_id' => $conversationId,
            'match_type' => 'all',
            'conditions' => [],
        ]);
    }

    $policy = $request('/customer/automation-sla-save.php', $token, [
        'name' => $marker,
        'first_response_minutes' => 15,
        'resolution_minutes' => 1440,
        'warning_before_minutes' => 5,
        'breach_priority' => 'urgent',
        'is_default' => false,
        'is_active' => false,
    ]);
    $policyId = (int) ($policy['policy_id'] ?? 0);
    if ($policyId <= 0) throw new RuntimeException('SLA API did not return policy_id.');

    $request('/customer/automation-sla-delete.php', $token, ['policy_id' => $policyId]);
    $policyId = 0;
    $request('/customer/automation-rule-delete.php', $token, ['rule_id' => $ruleId]);
    $ruleId = 0;

    echo json_encode([
        'success' => true,
        'overview' => 'passed',
        'rule_crud' => 'passed',
        'rule_preview' => $conversationId > 0 ? 'passed' : 'skipped',
        'sla_crud' => 'passed',
        'alert_list' => 'passed',
        'alert_stream' => 'passed',
        'alert_read' => 'passed',
        'initial_rule_count' => count($overview['rules'] ?? []),
        'temporary_data' => 'removed',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'Automation API smoke test failed: ' . $e->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    if ($alertId > 0) {
        $pdo->prepare("DELETE FROM automation_alerts WHERE id = :id AND tenant_id = :tenant_id")
            ->execute([':id' => $alertId, ':tenant_id' => (int) $user['tenant_id']]);
    }
    if ($policyId > 0) {
        $pdo->prepare("DELETE FROM automation_sla_policies WHERE id = :id AND tenant_id = :tenant_id")
            ->execute([':id' => $policyId, ':tenant_id' => (int) $user['tenant_id']]);
    }
    if ($ruleId > 0) {
        $pdo->prepare("DELETE FROM automation_rules WHERE id = :id AND tenant_id = :tenant_id")
            ->execute([':id' => $ruleId, ':tenant_id' => (int) $user['tenant_id']]);
    }
    if ($session && !empty($session['session_id'])) {
        $pdo->prepare("DELETE FROM auth_sessions WHERE id = :id")->execute([':id' => (int) $session['session_id']]);
    }
}

if (isset($exitCode)) exit($exitCode);
