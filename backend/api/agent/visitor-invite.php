<?php

// Messaging phase 6: operator starts a conversation with a live visitor.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site-access.php';
require_once __DIR__ . '/../../includes/subscription.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/routing.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/visitor-presence.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin','agent']);
$input = get_json_input();
$visitorId = (int) ($input['visitor_id'] ?? 0);
$departmentId = (int) ($input['department_id'] ?? 0);
$message = trim((string) ($input['message'] ?? ''));
if ($visitorId <= 0 || $message === '' || mb_strlen($message, 'UTF-8') > 5000) json_response(['success' => false, 'message' => 'visitor_id and a valid message are required'], 422);

enforce_rate_limit($pdo, 'agent_visitor_invite', rate_limit_identifier((string) $user['id']), 30, 3600, 'Too many proactive invitations.');

try {
    $visitorStmt = $pdo->prepare("\n        SELECT visitors.*, sites.tenant_id, sites.default_department_id, sites.name AS site_name\n        FROM visitors INNER JOIN sites ON sites.id = visitors.site_id\n        WHERE visitors.id = :visitor_id AND sites.tenant_id = :tenant_id AND sites.is_active = 1 LIMIT 1\n    ");
    $visitorStmt->execute([':visitor_id' => $visitorId, ':tenant_id' => (int) $user['tenant_id']]);
    $visitor = $visitorStmt->fetch();
    if (!$visitor) json_response(['success' => false, 'message' => 'Visitor not found'], 404);
    require_site_access($pdo, $user, (int) $visitor['site_id']);
    if (visitor_presence_status($visitor['last_seen_at']) === 'offline') json_response(['success' => false, 'message' => 'Visitor is no longer online'], 409);
    require_active_subscription($pdo, (int) $visitor['tenant_id'], 'visitor_invite');

    $departmentId = $departmentId > 0 ? $departmentId : (int) ($visitor['default_department_id'] ?? 0);
    $department = routing_department($pdo, $departmentId, (int) $visitor['tenant_id'], (int) $visitor['site_id'], true);
    if (!$department) json_response(['success' => false, 'message' => 'Department not found'], 404);
    if ($user['role'] === 'agent') {
        $memberStmt = $pdo->prepare("SELECT 1 FROM department_members WHERE department_id = :department_id AND user_id = :user_id AND is_active = 1 LIMIT 1");
        $memberStmt->execute([':department_id' => $departmentId, ':user_id' => (int) $user['id']]);
        if (!$memberStmt->fetchColumn()) json_response(['success' => false, 'message' => 'You are not a member of this department'], 403);
    }

    $pdo->beginTransaction();
    $conversationStmt = $pdo->prepare("SELECT id, assigned_agent_id, status FROM conversations WHERE site_id = :site_id AND visitor_id = :visitor_id AND status <> 'closed' ORDER BY id DESC LIMIT 1 FOR UPDATE");
    $conversationStmt->execute([':site_id' => (int) $visitor['site_id'], ':visitor_id' => $visitorId]);
    $conversation = $conversationStmt->fetch();
    if ($conversation) {
        $conversationId = (int) $conversation['id'];
        $pdo->prepare("UPDATE conversations SET department_id = :department_id, assigned_agent_id = COALESCE(assigned_agent_id, :agent_id), queue_status = 'assigned', queue_position = NULL, assigned_at = COALESCE(assigned_at, NOW()), assignment_method = COALESCE(assignment_method, 'manual'), status = CASE WHEN status IN ('new','pending') THEN 'in_progress' ELSE status END WHERE id = :id")
            ->execute([':department_id' => $departmentId, ':agent_id' => (int) $user['id'], ':id' => $conversationId]);
    } else {
        lock_tenant_plan_scope($pdo, (int) $visitor['tenant_id']);
        ensure_monthly_conversation_limit($pdo, (int) $visitor['site_id']);
        $insertConversation = $pdo->prepare("\n            INSERT INTO conversations (site_id, visitor_id, assigned_agent_id, department_id, status, queue_status, assigned_at, assignment_method, source_page_url, source_page_title, last_message_at)\n            VALUES (:site_id, :visitor_id, :agent_id, :department_id, 'in_progress', 'assigned', NOW(), 'manual', :source_page_url, :source_page_title, NOW())\n        ");
        $insertConversation->execute([
            ':site_id' => (int) $visitor['site_id'], ':visitor_id' => $visitorId, ':agent_id' => (int) $user['id'], ':department_id' => $departmentId,
            ':source_page_url' => $visitor['current_page_url'], ':source_page_title' => $visitor['current_page_title'],
        ]);
        $conversationId = (int) $pdo->lastInsertId();
        routing_log_assignment($pdo, $conversationId, $departmentId, null, (int) $user['id'], 'manual_assigned', 'manual', (int) $user['id'], 'Operator initiated conversation');
    }

    $messageStmt = $pdo->prepare("INSERT INTO messages (conversation_id, sender_type, message_type, sender_id, content, is_read) VALUES (:conversation_id, 'agent', 'text', :sender_id, :content, 0)");
    $messageStmt->execute([':conversation_id' => $conversationId, ':sender_id' => (int) $user['id'], ':content' => $message]);
    $messageId = (int) $pdo->lastInsertId();
    $pdo->prepare("UPDATE conversations SET last_message_at = NOW() WHERE id = :id")->execute([':id' => $conversationId]);

    $pdo->prepare("UPDATE visitor_operator_invites SET status = 'expired', responded_at = NOW() WHERE visitor_id = :visitor_id AND status IN ('pending','delivered')")
        ->execute([':visitor_id' => $visitorId]);
    $sessionStmt = $pdo->prepare("SELECT id FROM visitor_sessions WHERE visitor_id = :visitor_id ORDER BY last_seen_at DESC, id DESC LIMIT 1");
    $sessionStmt->execute([':visitor_id' => $visitorId]);
    $sessionId = $sessionStmt->fetchColumn();
    $ttl = visitor_presence_invite_ttl_seconds();
    $inviteStmt = $pdo->prepare("\n        INSERT INTO visitor_operator_invites (tenant_id, site_id, visitor_id, session_id, conversation_id, department_id, operator_id, message_id, message_preview, expires_at)\n        VALUES (:tenant_id, :site_id, :visitor_id, :session_id, :conversation_id, :department_id, :operator_id, :message_id, :message_preview, DATE_ADD(NOW(), INTERVAL {$ttl} SECOND))\n    ");
    $inviteStmt->execute([
        ':tenant_id' => (int) $visitor['tenant_id'], ':site_id' => (int) $visitor['site_id'], ':visitor_id' => $visitorId,
        ':session_id' => $sessionId ?: null, ':conversation_id' => $conversationId, ':department_id' => $departmentId,
        ':operator_id' => (int) $user['id'], ':message_id' => $messageId, ':message_preview' => mb_substr($message, 0, 500, 'UTF-8'),
    ]);
    $inviteId = (int) $pdo->lastInsertId();
    $pdo->commit();

    json_response(['success' => true, 'message' => 'Invitation sent', 'invite' => ['id' => $inviteId, 'conversation_id' => $conversationId, 'expires_in_seconds' => $ttl]], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to invite visitor'];
    if (!app_is_production()) $payload['error'] = $e->getMessage();
    json_response($payload, 500);
}
