<?php

// Messaging phase 5: start/reuse a conversation and route it to a department.

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/hosted-support.php';
require_once __DIR__ . '/../../includes/subscription.php';
require_once __DIR__ . '/../../includes/routing.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$input = get_json_input();
$siteKey = trim((string) ($input['site_key'] ?? ''));
$visitorId = isset($input['visitor_id']) ? (int) $input['visitor_id'] : 0;
$requestedDepartmentId = isset($input['department_id']) ? (int) $input['department_id'] : 0;
$sourcePageUrl = trim((string) ($input['source_page_url'] ?? ''));
$sourcePageTitle = trim((string) ($input['source_page_title'] ?? ''));

if ($siteKey === '' || $visitorId <= 0) {
    json_response(['success' => false, 'message' => 'site_key and visitor_id are required'], 422);
}
if (!preg_match('/^[a-f0-9]{32,128}$/i', $siteKey)) {
    json_response(['success' => false, 'message' => 'Invalid site_key'], 422);
}
if (mb_strlen($sourcePageUrl, 'UTF-8') > 1000 || mb_strlen($sourcePageTitle, 'UTF-8') > 255) {
    json_response(['success' => false, 'message' => 'Source page data is too long'], 422);
}
if ($sourcePageUrl !== '') {
    $scheme = strtolower((string) parse_url($sourcePageUrl, PHP_URL_SCHEME));
    if (!filter_var($sourcePageUrl, FILTER_VALIDATE_URL) || !in_array($scheme, ['http', 'https'], true)) {
        $sourcePageUrl = '';
    }
}

enforce_rate_limit(
    $pdo,
    'widget_conversation_start',
    rate_limit_identifier($siteKey . '|' . $visitorId . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    10,
    10 * 60,
    'Too many conversations started. Please try again later.'
);

try {
    $siteStmt = $pdo->prepare("\n        SELECT sites.id, sites.tenant_id, sites.domain, sites.default_department_id,\n               sites.department_selection_enabled\n        FROM sites\n        INNER JOIN tenants ON tenants.id = sites.tenant_id\n        WHERE sites.site_key = :site_key\n          AND sites.is_active = 1\n          AND tenants.status = 'active'\n        LIMIT 1\n    ");
    $siteStmt->execute([':site_key' => $siteKey]);
    $site = $siteStmt->fetch();

    if (!$site) {
        json_response(['success' => false, 'message' => 'Site not found'], 404);
    }

    $tenantId = (int) $site['tenant_id'];
    $siteId = (int) $site['id'];
    require_active_subscription($pdo, $tenantId, 'conversation_start');
    validate_widget_origin_or_fail($site['domain']);

    $supportStatus = hosted_support_compute_status($pdo, $siteId, hosted_support_site_timezone($pdo, $siteId));
    if (!$supportStatus['chat_available']) {
        json_response([
            'success' => false,
            'message' => $supportStatus['offline']['offline_message'] ?: 'پشتیبانی در حال حاضر امکان دریافت گفتگوی جدید را ندارد.',
            'code' => 'support_closed',
            'next_opening' => $supportStatus['next_opening'],
        ], 403);
    }

    $visitorStmt = $pdo->prepare("SELECT id FROM visitors WHERE id = :visitor_id AND site_id = :site_id LIMIT 1");
    $visitorStmt->execute([':visitor_id' => $visitorId, ':site_id' => $siteId]);
    if (!$visitorStmt->fetch()) {
        json_response(['success' => false, 'message' => 'Visitor not found'], 404);
    }

    $canSelectDepartment = (int) ($site['department_selection_enabled'] ?? 0) === 1;
    $departmentId = ($canSelectDepartment && $requestedDepartmentId > 0)
        ? $requestedDepartmentId
        : (int) ($site['default_department_id'] ?? 0);

    $department = $departmentId > 0
        ? routing_department($pdo, $departmentId, $tenantId, $siteId, true)
        : null;

    if (!$department) {
        $fallbackStmt = $pdo->prepare("\n            SELECT * FROM departments\n            WHERE site_id = :site_id AND tenant_id = :tenant_id AND is_active = 1\n            ORDER BY is_default DESC, id ASC LIMIT 1\n        ");
        $fallbackStmt->execute([':site_id' => $siteId, ':tenant_id' => $tenantId]);
        $department = $fallbackStmt->fetch() ?: null;
    }

    if (!$department) {
        json_response(['success' => false, 'message' => 'No active support department is available'], 422);
    }

    $findConversation = static function () use ($pdo, $siteId, $visitorId): ?array {
        $stmt = $pdo->prepare("\n            SELECT id, status, department_id, assigned_agent_id, queue_status, queue_position\n            FROM conversations\n            WHERE site_id = :site_id AND visitor_id = :visitor_id\n              AND status IN ('new','open','in_progress','waiting_customer','follow_up','pending')\n            ORDER BY id DESC LIMIT 1\n        ");
        $stmt->execute([':site_id' => $siteId, ':visitor_id' => $visitorId]);
        return $stmt->fetch() ?: null;
    };

    $updateSource = static function (int $conversationId) use ($pdo, $sourcePageUrl, $sourcePageTitle): void {
        $stmt = $pdo->prepare("\n            UPDATE conversations SET\n              source_page_url = COALESCE(NULLIF(:source_page_url, ''), source_page_url),\n              source_page_title = COALESCE(NULLIF(:source_page_title, ''), source_page_title)\n            WHERE id = :id\n        ");
        $stmt->execute([
            ':source_page_url' => $sourcePageUrl,
            ':source_page_title' => $sourcePageTitle,
            ':id' => $conversationId,
        ]);
    };

    $conversation = $findConversation();
    $routingResult = null;
    $createdConversation = false;

    if ($conversation) {
        $conversationId = (int) $conversation['id'];
        $updateSource($conversationId);

        if (!$conversation['department_id']) {
            $pdo->beginTransaction();
            $routingResult = routing_route_conversation($pdo, $conversationId, $department);
            $pdo->commit();
        }
    } else {
        $pdo->beginTransaction();
        lock_tenant_plan_scope($pdo, $tenantId);
        $conversation = $findConversation();

        if ($conversation) {
            $conversationId = (int) $conversation['id'];
            $updateSource($conversationId);
        } else {
            ensure_monthly_conversation_limit($pdo, $siteId);
            $insertStmt = $pdo->prepare("\n                INSERT INTO conversations (\n                    site_id, visitor_id, department_id, status, source_page_url, source_page_title, last_message_at\n                ) VALUES (\n                    :site_id, :visitor_id, :department_id, 'new', :source_page_url, :source_page_title, NOW()\n                )\n            ");
            $insertStmt->execute([
                ':site_id' => $siteId,
                ':visitor_id' => $visitorId,
                ':department_id' => (int) $department['id'],
                ':source_page_url' => $sourcePageUrl !== '' ? $sourcePageUrl : null,
                ':source_page_title' => $sourcePageTitle !== '' ? $sourcePageTitle : null,
            ]);
            $conversationId = (int) $pdo->lastInsertId();
            $routingResult = routing_route_conversation($pdo, $conversationId, $department);
            $createdConversation = true;
        }
        $pdo->commit();
    }

    if ($createdConversation) {
        automation_dispatch_event_safe(
            $pdo,
            'conversation_created',
            $conversationId,
            ['source_page_url' => $sourcePageUrl, 'source_page_title' => $sourcePageTitle],
            null,
            'conversation:' . $conversationId
        );
    }

    $resultStmt = $pdo->prepare("\n        SELECT conversations.id, conversations.department_id, conversations.assigned_agent_id,\n               conversations.queue_status, conversations.queue_position, conversations.queued_at,\n               departments.name AS department_name, departments.color AS department_color,\n               departments.queue_message, users.name AS assigned_agent_name\n        FROM conversations\n        LEFT JOIN departments ON departments.id = conversations.department_id\n        LEFT JOIN users ON users.id = conversations.assigned_agent_id\n        WHERE conversations.id = :id LIMIT 1\n    ");
    $resultStmt->execute([':id' => $conversationId]);
    $result = $resultStmt->fetch();

    json_response([
        'success' => true,
        'conversation' => [
            'id' => $conversationId,
            'site_id' => $siteId,
            'visitor_id' => $visitorId,
            'department' => $result && $result['department_id'] ? [
                'id' => (int) $result['department_id'],
                'name' => $result['department_name'],
                'color' => $result['department_color'],
            ] : null,
            'assigned_agent' => $result && $result['assigned_agent_id'] ? [
                'id' => (int) $result['assigned_agent_id'],
                'name' => $result['assigned_agent_name'],
            ] : null,
            'queue_status' => $result['queue_status'] ?? ($routingResult['queue_status'] ?? 'none'),
            'queue_position' => $result['queue_position'] !== null ? (int) $result['queue_position'] : null,
            'queue_message' => $result['queue_message'] ?? null,
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to start conversation'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
