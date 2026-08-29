<?php

declare(strict_types=1);

// Dependency-free, read-only database integrity check for Pass 2.
// Usage: php backend/cli/pass2-database-check.php [--json] [--fail-on-warning]

require_once __DIR__ . '/../config/app.php';

$jsonOnly = in_array('--json', $argv, true);
$failOnWarning = in_array('--fail-on-warning', $argv, true);

$expectedTables = [
    'admin_audit_logs','admin_impersonations','admin_ip_allowlist','admin_login_attempts',
    'admin_permissions','admin_roles','admin_role_permissions','admin_security_events',
    'admin_two_factor_recovery_codes','agent_site_access','ai_answer_logs','ai_content_chunks',
    'ai_crawl_queue','ai_crawl_runs','ai_crawl_sources','ai_generated_questions','ai_pages',
    'ai_site_settings','ai_suggestions','ai_terms','ai_unanswered_questions','announcements',
    'announcement_targets','announcement_user_states','api_rate_limits','auth_sessions',
    'conversations','conversation_assignment_logs','conversation_typing_status','customer_requests',
    'customer_request_events','departments','department_members','hosted_support_pages',
    'knowledge_sources','messages','message_attachments','message_mentions','message_reactions',
    'message_revisions','plans','qa_browser_fixtures','qa_findings','qa_test_artifacts',
    'qa_test_runs','qa_test_run_items','qa_test_scratch','quick_replies','sites',
    'site_business_hours','site_offline_settings','site_schedule_exceptions','subscription_payments',
    'system_error_logs','system_request_logs','system_service_heartbeats','system_settings','tenants',
    'tenant_notes','tenant_onboarding_items','tenant_subscriptions','tenant_tags',
    'tenant_tag_assignments','users','user_notification_preferences','visitors',
    'visitor_operator_invites','visitor_page_views','visitor_sessions','widget_events',
];

$criticalColumns = [
    'users' => ['id','tenant_id','email','password_hash','role','is_active','token_version'],
    'sites' => ['id','tenant_id','domain','site_key','is_active','default_department_id'],
    'visitors' => ['id','site_id','browser_id','last_seen_at'],
    'visitor_sessions' => ['id','site_id','visitor_id','session_key','last_seen_at'],
    'conversations' => ['id','site_id','visitor_id','assigned_agent_id','department_id','status','queue_status'],
    'departments' => ['id','tenant_id','site_id','name','routing_strategy','queue_message'],
    'messages' => ['id','conversation_id','sender_type','message_type','content','deleted_at'],
    'message_attachments' => ['id','message_id','file_path','file_url','mime_type','file_size'],
    'api_rate_limits' => ['id','rate_key','hits','window_start','expires_at'],
    'auth_sessions' => ['id','user_id','jti_hash','expires_at','revoked_at'],
    'system_error_logs' => ['id','fingerprint','level','message','status_code','occurrences'],
];

$checks = [];
$add = static function (string $name, string $status, mixed $actual, mixed $expected, string $details = '') use (&$checks): void {
    $checks[] = compact('name', 'status', 'actual', 'expected', 'details');
};

try {
    if (!in_array('mysql', PDO::getAvailableDrivers(), true)) {
        throw new RuntimeException('PDO MySQL driver is not installed/enabled. Enable pdo_mysql in php.ini.');
    }

    $host = (string) app_env('DB_HOST', 'localhost');
    $port = (int) app_env('DB_PORT', 3306);
    $database = (string) app_env('DB_NAME', 'ai_chat_saas');
    $user = (string) app_env('DB_USER', 'root');
    $password = (string) app_env('DB_PASS', '');

    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $serverVersion = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
    $add('database.connection', 'passed', $serverVersion, 'successful connection');

    $tableStmt = $pdo->prepare('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=:schema');
    $tableStmt->execute([':schema' => $database]);
    $actualTables = array_map(static fn(array $row): string => (string) $row['TABLE_NAME'], $tableStmt->fetchAll());
    $missingTables = array_values(array_diff($expectedTables, $actualTables));
    $add('schema.tables', $missingTables === [] ? 'passed' : 'failed', count($actualTables), count($expectedTables), $missingTables ? 'Missing: ' . implode(', ', $missingTables) : 'All expected tables exist.');

    foreach ($criticalColumns as $table => $columns) {
        if (!in_array($table, $actualTables, true)) {
            continue;
        }
        $columnStmt = $pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:table');
        $columnStmt->execute([':schema' => $database, ':table' => $table]);
        $actual = array_map(static fn(array $row): string => (string) $row['COLUMN_NAME'], $columnStmt->fetchAll());
        $missing = array_values(array_diff($columns, $actual));
        $add("schema.columns.{$table}", $missing === [] ? 'passed' : 'failed', count($actual), implode(', ', $columns), $missing ? 'Missing: ' . implode(', ', $missing) : 'Critical columns exist.');
    }

    $requiredUniqueIndexes = [
        'sites' => ['site_key'],
        'users' => ['email'],
        'api_rate_limits' => ['rate_key'],
        'auth_sessions' => ['jti_hash'],
        'visitor_sessions' => ['site_id','session_key'],
    ];
    foreach ($requiredUniqueIndexes as $table => $columns) {
        if (!in_array($table, $actualTables, true)) continue;
        $stmt = $pdo->prepare("SELECT INDEX_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_list FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:table AND NON_UNIQUE=0 GROUP BY INDEX_NAME");
        $stmt->execute([':schema' => $database, ':table' => $table]);
        $needle = implode(',', $columns);
        $found = false;
        foreach ($stmt->fetchAll() as $index) {
            if ((string) $index['columns_list'] === $needle) { $found = true; break; }
        }
        $add("schema.unique_index.{$table}.{$needle}", $found ? 'passed' : 'failed', $found, true, $found ? 'Unique index exists.' : 'Required unique index is missing.');
    }

    $requiredTableOptions = [
        'tenant_subscriptions' => ['engine' => 'InnoDB', 'collation' => 'utf8mb4_unicode_ci'],
        'subscription_payments' => ['engine' => 'InnoDB', 'collation' => 'utf8mb4_unicode_ci'],
    ];
    foreach ($requiredTableOptions as $table => $expectedOptions) {
        if (!in_array($table, $actualTables, true)) continue;
        $stmt = $pdo->prepare('SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:table LIMIT 1');
        $stmt->execute([':schema' => $database, ':table' => $table]);
        $options = $stmt->fetch() ?: [];
        $actualOptions = [
            'engine' => (string) ($options['ENGINE'] ?? ''),
            'collation' => (string) ($options['TABLE_COLLATION'] ?? ''),
        ];
        $valid = strcasecmp($actualOptions['engine'], $expectedOptions['engine']) === 0
            && strcasecmp($actualOptions['collation'], $expectedOptions['collation']) === 0;
        $add("schema.table_options.{$table}", $valid ? 'passed' : 'failed', $actualOptions, $expectedOptions, $valid ? 'Storage engine and collation are correct.' : 'Table engine or collation must be normalized.');
    }

    $requiredCheckConstraints = [
        'tenant_subscriptions' => ['chk_subscription_dates', 'chk_subscription_price'],
        'subscription_payments' => ['chk_payment_amount'],
    ];
    foreach ($requiredCheckConstraints as $table => $constraintNames) {
        if (!in_array($table, $actualTables, true)) continue;
        $stmt = $pdo->prepare("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=:schema AND TABLE_NAME=:table AND CONSTRAINT_TYPE='CHECK'");
        $stmt->execute([':schema' => $database, ':table' => $table]);
        $actualConstraints = array_map(static fn(array $row): string => (string) $row['CONSTRAINT_NAME'], $stmt->fetchAll());
        foreach ($constraintNames as $constraintName) {
            $found = in_array($constraintName, $actualConstraints, true);
            $add("schema.check_constraint.{$table}.{$constraintName}", $found ? 'passed' : 'failed', $found, true, $found ? 'Check constraint exists.' : 'Required check constraint is missing.');
        }
    }

    $countChecks = [
        ['integrity.orphan_conversations_site', "SELECT COUNT(*) FROM conversations c LEFT JOIN sites s ON s.id=c.site_id WHERE s.id IS NULL", 0, 'failed'],
        ['integrity.orphan_conversations_visitor', "SELECT COUNT(*) FROM conversations c LEFT JOIN visitors v ON v.id=c.visitor_id WHERE v.id IS NULL", 0, 'failed'],
        ['integrity.cross_site_conversation_visitor', "SELECT COUNT(*) FROM conversations c INNER JOIN visitors v ON v.id=c.visitor_id WHERE v.site_id<>c.site_id", 0, 'failed'],
        ['integrity.cross_site_department', "SELECT COUNT(*) FROM conversations c INNER JOIN departments d ON d.id=c.department_id WHERE d.site_id<>c.site_id", 0, 'failed'],
        ['integrity.orphan_messages', "SELECT COUNT(*) FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE c.id IS NULL", 0, 'failed'],
        ['integrity.orphan_attachments', "SELECT COUNT(*) FROM message_attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE m.id IS NULL", 0, 'failed'],
        ['integrity.duplicate_visitor_browser_identity', "SELECT COUNT(*) FROM (SELECT site_id,browser_id,COUNT(*) n FROM visitors WHERE browser_id IS NOT NULL AND browser_id<>'' GROUP BY site_id,browser_id HAVING COUNT(*)>1) d", 0, 'warning'],
        ['runtime.expired_auth_sessions_past_retention', "SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at<DATE_SUB(NOW(), INTERVAL 30 DAY)", 0, 'warning'],
        ['runtime.active_expired_impersonations', "SELECT COUNT(*) FROM admin_impersonations WHERE (status='issued' AND ticket_expires_at<NOW()) OR (status='active' AND expires_at<NOW())", 0, 'warning'],
        ['runtime.expired_rate_limit_rows', "SELECT COUNT(*) FROM api_rate_limits WHERE expires_at<DATE_SUB(NOW(), INTERVAL 1 DAY)", 0, 'warning'],
        ['runtime.unresolved_critical_errors', "SELECT COUNT(*) FROM system_error_logs WHERE resolved_at IS NULL AND level='critical'", 0, 'warning'],
        ['runtime.recent_http_500_errors', "SELECT COUNT(*) FROM system_error_logs WHERE status_code>=500 AND last_seen_at>=DATE_SUB(NOW(), INTERVAL 24 HOUR)", 0, 'warning'],
    ];

    foreach ($countChecks as [$name, $sql, $expected, $failureStatus]) {
        $dependencies = [];
        preg_match_all('/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/i', $sql, $matches);
        $dependencies = $matches[1] ?? [];
        if (array_diff($dependencies, $actualTables)) {
            $add($name, 'skipped', null, $expected, 'Required table is missing.');
            continue;
        }
        $actual = (int) $pdo->query($sql)->fetchColumn();
        $status = $actual === $expected ? 'passed' : $failureStatus;
        $add($name, $status, $actual, $expected);
    }

    $failed = count(array_filter($checks, static fn(array $row): bool => $row['status'] === 'failed'));
    $warnings = count(array_filter($checks, static fn(array $row): bool => $row['status'] === 'warning'));
    $report = [
        'generated_at' => date(DATE_ATOM),
        'database' => $database,
        'server_version' => $serverVersion,
        'status' => $failed > 0 ? 'failed' : ($warnings > 0 ? 'warning' : 'passed'),
        'summary' => ['total' => count($checks), 'failed' => $failed, 'warnings' => $warnings],
        'checks' => $checks,
    ];
} catch (Throwable $exception) {
    $report = [
        'generated_at' => date(DATE_ATOM),
        'status' => 'failed',
        'summary' => ['total' => count($checks), 'failed' => 1, 'warnings' => 0],
        'error' => [
            'type' => get_class($exception),
            'message' => $exception->getMessage(),
        ],
        'checks' => $checks,
    ];
}

if ($jsonOnly) {
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
} else {
    echo "AI Chat SaaS - Pass 2 database check\n";
    echo "Status: " . strtoupper((string) $report['status']) . "\n";
    foreach ($report['checks'] as $check) {
        echo sprintf("[%s] %s | actual=%s expected=%s%s\n", strtoupper($check['status']), $check['name'], json_encode($check['actual'], JSON_UNESCAPED_UNICODE), json_encode($check['expected'], JSON_UNESCAPED_UNICODE), $check['details'] !== '' ? ' | ' . $check['details'] : '');
    }
    if (isset($report['error'])) {
        echo '[FAILED] ' . $report['error']['message'] . "\n";
    }
}

$hasFailure = ($report['summary']['failed'] ?? 1) > 0;
$hasWarning = ($report['summary']['warnings'] ?? 0) > 0;
exit($hasFailure || ($failOnWarning && $hasWarning) ? 1 : 0);
