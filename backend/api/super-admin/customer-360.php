<?php

// پرونده ۳۶۰ درجه مشتری: سلامت، اشتراک، پرداخت، برچسب، یادداشت، چک‌لیست و Timeline

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/customer-360.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$tenantId = filter_var($_GET['tenant_id'] ?? 0, FILTER_VALIDATE_INT, [
    'options' => ['default' => 0, 'min_range' => 1],
]);
if ($tenantId <= 0) {
    json_response(['success' => false, 'message' => 'tenant_id is required'], 422);
}

try {
    $tenantStmt = $pdo->prepare("\n        SELECT t.id,t.name,t.owner_name,t.owner_email,t.owner_phone,t.status,t.lifecycle_stage,\n               t.suspension_reason,t.account_manager_id,t.onboarding_completed_at,t.plan_id,\n               t.created_at,t.updated_at,p.name plan_name,p.max_sites,p.max_agents,p.max_monthly_conversations,\n               manager.name account_manager_name,manager.email account_manager_email\n        FROM tenants t\n        LEFT JOIN plans p ON p.id=t.plan_id\n        LEFT JOIN users manager ON manager.id=t.account_manager_id AND manager.role='super_admin'\n        WHERE t.id=:tenant_id LIMIT 1\n    ");
    $tenantStmt->execute([':tenant_id' => $tenantId]);
    $tenant = $tenantStmt->fetch();
    if (!$tenant) {
        json_response(['success' => false, 'message' => 'Customer not found'], 404);
    }

    $canSupport = admin_has_permission($user, 'customers.support');
    $canImpersonate = admin_has_permission($user, 'customers.impersonate');
    $canExport = admin_has_permission($user, 'customers.export');
    $canManage = admin_has_permission($user, 'customers.manage');

    customer360_ensure_onboarding($pdo, $tenantId);
    customer360_sync_detectable_onboarding($pdo, $tenantId);

    $allTags = $pdo->query("SELECT id,name,slug,color,is_active FROM tenant_tags WHERE is_active=1 ORDER BY name,id")->fetchAll();
    $assignedStmt = $pdo->prepare("\n        SELECT tt.id,tt.name,tt.slug,tt.color,tta.created_at,assigner.name assigned_by_name\n        FROM tenant_tag_assignments tta\n        INNER JOIN tenant_tags tt ON tt.id=tta.tag_id\n        LEFT JOIN users assigner ON assigner.id=tta.assigned_by\n        WHERE tta.tenant_id=:tenant_id ORDER BY tt.name\n    ");
    $assignedStmt->execute([':tenant_id' => $tenantId]);
    $assignedTags = $assignedStmt->fetchAll();

    $notes = [];
    if ($canSupport) {
        $notesStmt = $pdo->prepare("
        SELECT n.id,n.body,n.is_pinned,n.created_at,n.updated_at,u.id author_id,u.name author_name,u.email author_email
        FROM tenant_notes n INNER JOIN users u ON u.id=n.author_user_id
        WHERE n.tenant_id=:tenant_id
        ORDER BY n.is_pinned DESC,n.created_at DESC LIMIT 60
    ");
        $notesStmt->execute([':tenant_id' => $tenantId]);
        $notes = $notesStmt->fetchAll();
    }

    $onboardingStmt = $pdo->prepare("\n        SELECT oi.id,oi.item_key,oi.title,oi.status,oi.sort_order,oi.due_at,oi.completed_at,\n               oi.completed_by,completer.name completed_by_name,oi.updated_at\n        FROM tenant_onboarding_items oi\n        LEFT JOIN users completer ON completer.id=oi.completed_by\n        WHERE oi.tenant_id=:tenant_id ORDER BY oi.sort_order,oi.id\n    ");
    $onboardingStmt->execute([':tenant_id' => $tenantId]);
    $onboarding = $onboardingStmt->fetchAll();
    $onboardingTotal = count($onboarding);
    $onboardingCompleted = count(array_filter($onboarding, static fn(array $item): bool => in_array($item['status'], ['done','skipped'], true)));
    $onboardingPercent = $onboardingTotal > 0 ? (int) round(($onboardingCompleted * 100) / $onboardingTotal) : 100;

    $subscriptionStmt = $pdo->prepare("\n        SELECT s.id,s.status,s.billing_cycle,s.starts_at,s.ends_at,s.trial_ends_at,s.auto_renew,s.price,s.currency,\n               s.created_at,s.updated_at,p.id plan_id,p.name plan_name,\n               DATEDIFF(s.ends_at,NOW()) days_left\n        FROM tenant_subscriptions s INNER JOIN plans p ON p.id=s.plan_id\n        WHERE s.tenant_id=:tenant_id\n        ORDER BY FIELD(s.status,'active','trial','past_due','suspended','expired','cancelled'),s.ends_at DESC,s.id DESC LIMIT 1\n    ");
    $subscriptionStmt->execute([':tenant_id' => $tenantId]);
    $subscription = $subscriptionStmt->fetch() ?: null;

    $paymentsStmt = $pdo->prepare("\n        SELECT id,subscription_id,amount,currency,payment_method,reference_number,status,paid_at,description,created_at\n        FROM subscription_payments WHERE tenant_id=:tenant_id ORDER BY COALESCE(paid_at,created_at) DESC,id DESC LIMIT 15\n    ");
    $paymentsStmt->execute([':tenant_id' => $tenantId]);
    $payments = $paymentsStmt->fetchAll();
    $paymentSummaryStmt = $pdo->prepare("\n        SELECT COUNT(*) payments_count,\n               COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) paid_total,\n               COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending_total,\n               MAX(COALESCE(paid_at,created_at)) last_payment_at\n        FROM subscription_payments WHERE tenant_id=:tenant_id\n    ");
    $paymentSummaryStmt->execute([':tenant_id' => $tenantId]);
    $paymentSummary = $paymentSummaryStmt->fetch() ?: [];

    $metricsStmt = $pdo->prepare("\n        SELECT\n          (SELECT COUNT(*) FROM sites WHERE tenant_id=?) sites_count,\n          (SELECT COUNT(*) FROM users WHERE tenant_id=? AND role='agent') agents_count,\n          (SELECT COUNT(*) FROM conversations c INNER JOIN sites s ON s.id=c.site_id\n             WHERE s.tenant_id=? AND c.created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01')) conversations_month,\n          (SELECT MAX(COALESCE(c.last_message_at,c.created_at)) FROM conversations c INNER JOIN sites s ON s.id=c.site_id\n             WHERE s.tenant_id=?) last_activity_at,\n          (SELECT COALESCE(SUM(ma.file_size),0) FROM message_attachments ma\n             INNER JOIN messages m ON m.id=ma.message_id INNER JOIN conversations c ON c.id=m.conversation_id\n             INNER JOIN sites s ON s.id=c.site_id WHERE s.tenant_id=?) storage_bytes,\n          (SELECT COUNT(*) FROM ai_crawl_runs WHERE tenant_id=? AND status IN ('failed','cancelled')) failed_crawls,\n          (SELECT COUNT(*) FROM ai_crawl_runs WHERE tenant_id=? AND status IN ('queued','running')) active_crawls\n    ");
    $metricsStmt->execute(array_fill(0, 7, $tenantId));
    $metrics = $metricsStmt->fetch() ?: [];

    $usageSignals = [];
    foreach ([
        ['used' => (int) ($metrics['sites_count'] ?? 0), 'limit' => $tenant['max_sites']],
        ['used' => (int) ($metrics['agents_count'] ?? 0), 'limit' => $tenant['max_agents']],
        ['used' => (int) ($metrics['conversations_month'] ?? 0), 'limit' => $tenant['max_monthly_conversations']],
    ] as $item) {
        $limit = $item['limit'] !== null ? (int) $item['limit'] : 0;
        if ($limit > 0) {
            $usageSignals[] = $item['used'] > $limit ? 'over' : (($item['used'] / $limit) >= .8 ? 'near' : 'ok');
        }
    }
    $lastActivityAt = $metrics['last_activity_at'] ?: $tenant['updated_at'] ?: $tenant['created_at'];
    $daysSinceActivity = max(0, (int) floor((time() - strtotime((string) $lastActivityAt)) / 86400));
    $health = customer360_health([
        'tenant_status' => $tenant['status'],
        'subscription_status' => $subscription['status'] ?? null,
        'subscription_days_left' => $subscription ? (int) $subscription['days_left'] : null,
        'usage_over_limit' => in_array('over', $usageSignals, true),
        'usage_near_limit' => in_array('near', $usageSignals, true),
        'failed_crawls' => (int) ($metrics['failed_crawls'] ?? 0),
        'onboarding_percent' => $onboardingPercent,
        'days_since_activity' => $daysSinceActivity,
    ]);

    $auditStmt = $pdo->prepare("\n        SELECT id,action,entity_type,entity_id,description,old_values_json,new_values_json,created_at,\n               actor_user_id,actor_name,actor_email\n        FROM admin_audit_logs WHERE tenant_id=:tenant_id\n        ORDER BY created_at DESC,id DESC LIMIT 80\n    ");
    $auditStmt->execute([':tenant_id' => $tenantId]);
    $timeline = [];
    foreach ($auditStmt->fetchAll() as $event) {
        $timeline[] = [
            'id' => 'audit-' . $event['id'],
            'type' => 'audit',
            'title' => $event['description'],
            'action' => $event['action'],
            'actor_name' => $event['actor_name'],
            'actor_email' => $event['actor_email'],
            'created_at' => $event['created_at'],
            'old_values' => customer360_decode_json($event['old_values_json']),
            'new_values' => customer360_decode_json($event['new_values_json']),
        ];
    }
    foreach ($notes as $note) {
        $timeline[] = [
            'id' => 'note-' . $note['id'],
            'type' => 'note',
            'title' => $note['is_pinned'] ? 'یادداشت سنجاق‌شده' : 'یادداشت داخلی',
            'body' => $note['body'],
            'actor_name' => $note['author_name'],
            'actor_email' => $note['author_email'],
            'created_at' => $note['created_at'],
        ];
    }
    foreach ($payments as $payment) {
        $timeline[] = [
            'id' => 'payment-' . $payment['id'],
            'type' => 'payment',
            'title' => 'پرداخت ' . $payment['status'],
            'amount' => (float) $payment['amount'],
            'currency' => $payment['currency'],
            'reference_number' => $payment['reference_number'],
            'created_at' => $payment['paid_at'] ?: $payment['created_at'],
        ];
    }
    usort($timeline, static fn(array $a, array $b): int => strtotime((string) $b['created_at']) <=> strtotime((string) $a['created_at']));
    $timeline = array_slice($timeline, 0, 100);

    $managers = $pdo->query("\n        SELECT id,name,email FROM users WHERE role='super_admin' AND is_active=1 ORDER BY name,id\n    ")->fetchAll();
    $impersonationTargets = [];
    if ($canImpersonate) {
        $targetsStmt = $pdo->prepare("
        SELECT id,name,email,role,is_active,last_login_at FROM users
        WHERE tenant_id=:tenant_id AND role IN ('customer_admin','agent')
        ORDER BY CASE WHEN role='customer_admin' THEN 0 ELSE 1 END,name,id
    ");
        $targetsStmt->execute([':tenant_id' => $tenantId]);
        $impersonationTargets = $targetsStmt->fetchAll();
    }

    json_response([
        'success' => true,
        'tenant_profile' => [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'status' => $tenant['status'],
            'lifecycle_stage' => $tenant['lifecycle_stage'],
            'suspension_reason' => $tenant['suspension_reason'],
            'account_manager_id' => $tenant['account_manager_id'] !== null ? (int) $tenant['account_manager_id'] : null,
            'account_manager_name' => $tenant['account_manager_name'],
            'account_manager_email' => $tenant['account_manager_email'],
            'onboarding_completed_at' => $tenant['onboarding_completed_at'],
            'last_activity_at' => $lastActivityAt,
        ],
        'health' => $health,
        'metrics' => [
            'storage_bytes' => (int) ($metrics['storage_bytes'] ?? 0),
            'failed_crawls' => (int) ($metrics['failed_crawls'] ?? 0),
            'active_crawls' => (int) ($metrics['active_crawls'] ?? 0),
            'days_since_activity' => $daysSinceActivity,
        ],
        'subscription' => $subscription ? [
            ...$subscription,
            'id' => (int) $subscription['id'],
            'plan_id' => (int) $subscription['plan_id'],
            'auto_renew' => (bool) $subscription['auto_renew'],
            'price' => (float) $subscription['price'],
            'days_left' => (int) $subscription['days_left'],
        ] : null,
        'payment_summary' => [
            'payments_count' => (int) ($paymentSummary['payments_count'] ?? 0),
            'paid_total' => (float) ($paymentSummary['paid_total'] ?? 0),
            'pending_total' => (float) ($paymentSummary['pending_total'] ?? 0),
            'last_payment_at' => $paymentSummary['last_payment_at'] ?? null,
        ],
        'payments' => array_map(static fn(array $p): array => [
            ...$p,
            'id' => (int) $p['id'],
            'subscription_id' => (int) $p['subscription_id'],
            'amount' => (float) $p['amount'],
        ], $payments),
        'all_tags' => array_map(static fn(array $tag): array => [
            ...$tag,
            'id' => (int) $tag['id'],
            'is_active' => (bool) $tag['is_active'],
        ], $allTags),
        'assigned_tags' => array_map(static fn(array $tag): array => [...$tag, 'id' => (int) $tag['id']], $assignedTags),
        'notes' => array_map(static fn(array $note): array => [
            ...$note,
            'id' => (int) $note['id'],
            'author_id' => (int) $note['author_id'],
            'is_pinned' => (bool) $note['is_pinned'],
        ], $notes),
        'onboarding' => [
            'percent' => $onboardingPercent,
            'completed' => $onboardingCompleted,
            'total' => $onboardingTotal,
            'items' => array_map(static fn(array $item): array => [
                ...$item,
                'id' => (int) $item['id'],
                'sort_order' => (int) $item['sort_order'],
                'completed_by' => $item['completed_by'] !== null ? (int) $item['completed_by'] : null,
            ], $onboarding),
        ],
        'timeline' => $timeline,
        'account_managers' => array_map(static fn(array $manager): array => [...$manager, 'id' => (int) $manager['id']], $managers),
        'impersonation_targets' => array_map(static fn(array $target): array => [
            ...$target,
            'id' => (int) $target['id'],
            'is_active' => (bool) $target['is_active'],
        ], $impersonationTargets),
        'permissions' => [
            'can_support' => $canSupport,
            'can_impersonate' => $canImpersonate,
            'can_export' => $canExport,
            'can_manage' => $canManage,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[AI_CHAT_SAAS_CUSTOMER360] ' . $e->getMessage());
    $payload = ['success' => false, 'message' => 'بارگذاری پرونده ۳۶۰ مشتری ناموفق بود.'];
    if (function_exists('app_debug_enabled') && app_debug_enabled()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
