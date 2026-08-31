<?php

// Messaging phase 6: accept or dismiss an operator-initiated conversation invite.

require_once __DIR__ . '/../../includes/widget-cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);

$input = get_json_input();
$siteKey = trim((string) ($input['site_key'] ?? ''));
$visitorId = (int) ($input['visitor_id'] ?? 0);
$inviteId = (int) ($input['invite_id'] ?? 0);
$action = trim((string) ($input['action'] ?? ''));

if ($siteKey === '' || $visitorId <= 0 || $inviteId <= 0 || !in_array($action, ['accept','dismiss'], true)) {
    json_response(['success' => false, 'message' => 'Invalid invite response'], 422);
}

enforce_rate_limit($pdo, 'widget_invite_response', rate_limit_identifier($siteKey . '|' . $visitorId), 20, 300, 'Too many invite responses.');

try {
    $stmt = $pdo->prepare("\n        SELECT voi.*, sites.domain, departments.name AS department_name, departments.color AS department_color, users.name AS operator_name\n        FROM visitor_operator_invites voi\n        INNER JOIN sites ON sites.id = voi.site_id\n        LEFT JOIN departments ON departments.id = voi.department_id\n        INNER JOIN users ON users.id = voi.operator_id\n        WHERE voi.id = :invite_id AND voi.visitor_id = :visitor_id AND sites.site_key = :site_key\n        LIMIT 1\n    ");
    $stmt->execute([':invite_id' => $inviteId, ':visitor_id' => $visitorId, ':site_key' => $siteKey]);
    $invite = $stmt->fetch();
    if (!$invite) json_response(['success' => false, 'message' => 'Invite not found'], 404);
    validate_widget_origin_or_fail($invite['domain']);
    if (!in_array($invite['status'], ['pending','delivered'], true) || strtotime($invite['expires_at']) <= time()) {
        json_response(['success' => false, 'message' => 'Invite has expired'], 410);
    }

    $pdo->beginTransaction();
    $conversationStatusStmt = $pdo->prepare("SELECT status FROM conversations WHERE id = :id LIMIT 1 FOR UPDATE");
    $conversationStatusStmt->execute([':id' => (int) $invite['conversation_id']]);
    $previousStatus = (string) ($conversationStatusStmt->fetchColumn() ?: '');
    if ($previousStatus === '') throw new RuntimeException('Invite conversation not found');

    if ($action === 'accept') {
        $pdo->prepare("UPDATE visitor_operator_invites SET status = 'accepted', responded_at = NOW() WHERE id = :id")
            ->execute([':id' => $inviteId]);
        $statusChanged = in_array($previousStatus, ['new', 'pending'], true);
        if ($statusChanged) {
            $pdo->prepare("UPDATE conversations SET status = 'in_progress' WHERE id = :id AND status = :previous_status")
                ->execute([':id' => (int) $invite['conversation_id'], ':previous_status' => $previousStatus]);
        }
        $pdo->commit();
        if ($statusChanged) {
            automation_dispatch_event_safe(
                $pdo,
                'status_changed',
                (int) $invite['conversation_id'],
                ['previous_status' => $previousStatus, 'new_status' => 'in_progress'],
                null,
                'invite:' . $inviteId . ':accepted'
            );
        }
        json_response([
            'success' => true,
            'action' => 'accepted',
            'conversation' => [
                'id' => (int) $invite['conversation_id'], 'site_id' => (int) $invite['site_id'], 'visitor_id' => $visitorId,
                'department' => $invite['department_id'] ? ['id' => (int) $invite['department_id'], 'name' => $invite['department_name'], 'color' => $invite['department_color']] : null,
                'assigned_agent' => ['id' => (int) $invite['operator_id'], 'name' => $invite['operator_name']],
                'queue_status' => 'assigned', 'queue_position' => null,
            ],
        ]);
    }

    $pdo->prepare("UPDATE visitor_operator_invites SET status = 'dismissed', responded_at = NOW() WHERE id = :id")
        ->execute([':id' => $inviteId]);
    $visitorMessageStmt = $pdo->prepare("SELECT COUNT(*) FROM messages WHERE conversation_id = :conversation_id AND sender_type = 'visitor' AND deleted_at IS NULL");
    $visitorMessageStmt->execute([':conversation_id' => (int) $invite['conversation_id']]);
    $closedConversation = false;
    if ((int) $visitorMessageStmt->fetchColumn() === 0) {
        $closeStmt = $pdo->prepare("UPDATE conversations SET status = 'closed', closed_at = NOW() WHERE id = :id AND status <> 'closed'");
        $closeStmt->execute([':id' => (int) $invite['conversation_id']]);
        $closedConversation = $closeStmt->rowCount() > 0;
    }
    $pdo->commit();
    if ($closedConversation) {
        automation_dispatch_event_safe(
            $pdo,
            'status_changed',
            (int) $invite['conversation_id'],
            ['previous_status' => $previousStatus, 'new_status' => 'closed'],
            null,
            'invite:' . $inviteId . ':dismissed'
        );
    }
    json_response(['success' => true, 'action' => 'dismissed']);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $payload = ['success' => false, 'message' => 'Failed to respond to invite'];
    safe_api_exception_context($e);
    json_response($payload, 500);
}
