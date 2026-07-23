<?php

// Shared helpers for reply, edit/delete and message presentation.

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/response.php';

if (!function_exists('message_edit_window_seconds')) {
    function message_edit_window_seconds(): int
    {
        return max(60, (int) app_env('MESSAGE_EDIT_WINDOW_SECONDS', 15 * 60));
    }
}

if (!function_exists('message_is_within_edit_window')) {
    function message_is_within_edit_window(?string $createdAt): bool
    {
        if (!$createdAt) {
            return false;
        }

        $createdTimestamp = strtotime($createdAt);

        if ($createdTimestamp === false) {
            return false;
        }

        return (time() - $createdTimestamp) <= message_edit_window_seconds();
    }
}

if (!function_exists('normalize_message_type')) {
    function normalize_message_type(?string $messageType, ?string $mimeType = null): string
    {
        $messageType = strtolower(trim((string) $messageType));
        $mimeType = strtolower(trim((string) $mimeType));

        $voiceMimeTypes = ['video/webm', 'application/ogg'];

        if ($messageType === 'voice' && (
            str_starts_with($mimeType, 'audio/')
            || in_array($mimeType, $voiceMimeTypes, true)
        )) {
            return 'voice';
        }

        if ($messageType === 'system') {
            return 'system';
        }

        if ($mimeType !== '') {
            return str_starts_with($mimeType, 'audio/') ? 'voice' : 'file';
        }

        return 'text';
    }
}

if (!function_exists('validate_reply_target_or_fail')) {
    function validate_reply_target_or_fail(PDO $pdo, int $conversationId, int $replyToMessageId, string $viewerType = 'agent'): ?array
    {
        if ($replyToMessageId <= 0) {
            return null;
        }

        $stmt = $pdo->prepare("\n            SELECT\n                messages.id,\n                messages.conversation_id,\n                messages.sender_type,\n                messages.sender_id,\n                messages.content,\n                messages.message_type,\n                messages.deleted_at,\n                users.name AS agent_name\n            FROM messages\n            LEFT JOIN users\n                ON users.id = messages.sender_id\n                AND messages.sender_type = 'agent'\n            WHERE messages.id = :message_id\n              AND messages.conversation_id = :conversation_id\n            LIMIT 1\n        ");

        $stmt->execute([
            ':message_id' => $replyToMessageId,
            ':conversation_id' => $conversationId,
        ]);

        $message = $stmt->fetch();

        if (!$message || $message['deleted_at'] !== null || ($viewerType === 'visitor' && $message['message_type'] === 'internal_note')) {
            json_response([
                'success' => false,
                'message' => 'Reply target is not available',
            ], 422);
        }

        return $message;
    }
}

if (!function_exists('message_can_be_modified_by')) {
    function message_can_be_modified_by(array $message, string $actorType, int $actorId): bool
    {
        if ($message['deleted_at'] !== null) {
            return false;
        }

        if ($actorType === 'agent') {
            return $message['sender_type'] === 'agent'
                && (int) $message['sender_id'] === $actorId
                && message_is_within_edit_window($message['created_at'] ?? null);
        }

        if ($actorType === 'visitor') {
            return $message['sender_type'] === 'visitor'
                && (int) $message['sender_id'] === $actorId
                && message_is_within_edit_window($message['created_at'] ?? null);
        }

        return false;
    }
}

if (!function_exists('message_reply_snapshot')) {
    function message_reply_snapshot(array $message): array
    {
        $content = trim((string) ($message['reply_content'] ?? ''));

        if (!empty($message['reply_deleted_at'])) {
            $content = 'این پیام حذف شده است.';
        }

        if (function_exists('mb_substr')) {
            $content = mb_substr($content, 0, 220, 'UTF-8');
        } else {
            $content = substr($content, 0, 220);
        }

        return [
            'id' => isset($message['reply_id']) ? (int) $message['reply_id'] : null,
            'sender_type' => $message['reply_sender_type'] ?? null,
            'sender_name' => $message['reply_sender_type'] === 'agent'
                ? ($message['reply_agent_name'] ?? 'پشتیبان')
                : ($message['reply_sender_type'] === 'visitor' ? 'کاربر' : 'سیستم'),
            'content' => $content,
            'is_deleted' => !empty($message['reply_deleted_at']),
        ];
    }
}


if (!function_exists('message_allowed_reactions')) {
    function message_allowed_reactions(): array
    {
        return ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    }
}

if (!function_exists('validate_message_reaction_or_fail')) {
    function validate_message_reaction_or_fail(string $emoji): string
    {
        $emoji = trim($emoji);

        if (!in_array($emoji, message_allowed_reactions(), true)) {
            json_response([
                'success' => false,
                'message' => 'Unsupported reaction',
            ], 422);
        }

        return $emoji;
    }
}

if (!function_exists('message_reactions_by_message_ids')) {
    function message_reactions_by_message_ids(PDO $pdo, array $messageIds, string $actorType, int $actorId): array
    {
        $messageIds = array_values(array_unique(array_filter(array_map('intval', $messageIds), static fn ($id) => $id > 0)));

        if (!$messageIds) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));
        $stmt = $pdo->prepare("
            SELECT
                message_id,
                emoji,
                COUNT(*) AS reaction_count,
                MAX(CASE WHEN actor_type = ? AND actor_id = ? THEN 1 ELSE 0 END) AS mine
            FROM message_reactions
            WHERE message_id IN ($placeholders)
            GROUP BY message_id, emoji
            ORDER BY MIN(id) ASC
        ");
        $stmt->execute(array_merge([$actorType, $actorId], $messageIds));

        $result = [];

        foreach ($stmt->fetchAll() as $row) {
            $messageId = (int) $row['message_id'];
            $result[$messageId] ??= [];
            $result[$messageId][] = [
                'emoji' => $row['emoji'],
                'count' => (int) $row['reaction_count'],
                'mine' => (bool) $row['mine'],
            ];
        }

        return $result;
    }
}

if (!function_exists('normalize_mentioned_user_ids')) {
    function normalize_mentioned_user_ids(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        return array_values(array_unique(array_filter(
            array_map('intval', $value),
            static fn ($id) => $id > 0
        )));
    }
}

if (!function_exists('validate_mentioned_users_or_fail')) {
    function validate_mentioned_users_or_fail(
        PDO $pdo,
        array $userIds,
        int $tenantId,
        int $siteId
    ): array {
        $userIds = normalize_mentioned_user_ids($userIds);

        if (!$userIds) {
            return [];
        }

        if (count($userIds) > 20) {
            json_response([
                'success' => false,
                'message' => 'Too many mentioned users',
            ], 422);
        }

        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
        $sql = "
            SELECT DISTINCT users.id, users.name
            FROM users
            LEFT JOIN agent_site_access
                ON agent_site_access.user_id = users.id
                AND agent_site_access.site_id = ?
            WHERE users.id IN ($placeholders)
              AND users.tenant_id = ?
              AND users.is_active = 1
              AND users.role IN ('customer_admin', 'agent')
              AND (
                    users.role = 'customer_admin'
                    OR agent_site_access.id IS NOT NULL
              )
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$siteId], $userIds, [$tenantId]));
        $users = $stmt->fetchAll();

        if (count($users) !== count($userIds)) {
            json_response([
                'success' => false,
                'message' => 'One or more mentioned users are invalid for this conversation',
            ], 422);
        }

        return array_map(static fn ($user) => [
            'id' => (int) $user['id'],
            'name' => $user['name'],
        ], $users);
    }
}

if (!function_exists('replace_message_mentions')) {
    function replace_message_mentions(PDO $pdo, int $messageId, int $creatorUserId, array $mentionedUsers): void
    {
        $deleteStmt = $pdo->prepare('DELETE FROM message_mentions WHERE message_id = :message_id');
        $deleteStmt->execute([':message_id' => $messageId]);

        if (!$mentionedUsers) {
            return;
        }

        $insertStmt = $pdo->prepare("
            INSERT INTO message_mentions (
                message_id,
                mentioned_user_id,
                created_by_user_id
            ) VALUES (
                :message_id,
                :mentioned_user_id,
                :created_by_user_id
            )
        ");

        foreach ($mentionedUsers as $mentionedUser) {
            $insertStmt->execute([
                ':message_id' => $messageId,
                ':mentioned_user_id' => (int) $mentionedUser['id'],
                ':created_by_user_id' => $creatorUserId,
            ]);
        }
    }
}

if (!function_exists('message_mentions_by_message_ids')) {
    function message_mentions_by_message_ids(PDO $pdo, array $messageIds): array
    {
        $messageIds = array_values(array_unique(array_filter(array_map('intval', $messageIds), static fn ($id) => $id > 0)));

        if (!$messageIds) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));
        $stmt = $pdo->prepare("
            SELECT
                message_mentions.message_id,
                users.id,
                users.name
            FROM message_mentions
            INNER JOIN users ON users.id = message_mentions.mentioned_user_id
            WHERE message_mentions.message_id IN ($placeholders)
            ORDER BY message_mentions.id ASC
        ");
        $stmt->execute($messageIds);

        $result = [];

        foreach ($stmt->fetchAll() as $row) {
            $messageId = (int) $row['message_id'];
            $result[$messageId] ??= [];
            $result[$messageId][] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
            ];
        }

        return $result;
    }
}

if (!function_exists('message_delivery_status')) {
    function message_delivery_status(?string $deliveredAt, ?string $readAt): string
    {
        if ($readAt !== null && $readAt !== '') {
            return 'read';
        }

        if ($deliveredAt !== null && $deliveredAt !== '') {
            return 'delivered';
        }

        return 'sent';
    }
}

if (!function_exists('mark_conversation_messages_received')) {
    /**
     * Marks messages from selected sender types as delivered/read by the opposite side.
     * Returns the affected unread message ids before the update, so the UI can render
     * the "new messages" divider on the first load.
     */
    function mark_conversation_messages_received(
        PDO $pdo,
        int $conversationId,
        array $senderTypes,
        bool $markRead
    ): array {
        $senderTypes = array_values(array_unique(array_filter(
            array_map(static fn ($type) => strtolower(trim((string) $type)), $senderTypes),
            static fn ($type) => in_array($type, ['visitor', 'agent', 'ai', 'system'], true)
        )));

        if ($conversationId <= 0 || !$senderTypes) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($senderTypes), '?'));
        $selectStmt = $pdo->prepare("\n            SELECT id\n            FROM messages\n            WHERE conversation_id = ?\n              AND sender_type IN ($placeholders)\n              AND message_type <> 'internal_note'\n              AND deleted_at IS NULL\n              AND read_at IS NULL\n            ORDER BY id ASC\n        ");
        $selectStmt->execute(array_merge([$conversationId], $senderTypes));
        $unreadIds = array_map('intval', array_column($selectStmt->fetchAll(), 'id'));

        $setSql = "delivered_at = COALESCE(delivered_at, NOW())";
        $missingReceiptSql = "delivered_at IS NULL";

        if ($markRead) {
            $setSql .= ", read_at = COALESCE(read_at, NOW()), is_read = 1";
            $missingReceiptSql .= " OR read_at IS NULL";
        }

        $setSql .= ", interaction_updated_at = NOW()";

        $updateStmt = $pdo->prepare("\n            UPDATE messages\n            SET $setSql\n            WHERE conversation_id = ?\n              AND sender_type IN ($placeholders)\n              AND message_type <> 'internal_note'\n              AND deleted_at IS NULL\n              AND ($missingReceiptSql)\n        ");
        $updateStmt->execute(array_merge([$conversationId], $senderTypes));

        return $unreadIds;
    }
}

if (!function_exists('visitor_is_recently_online')) {
    function visitor_is_recently_online(?string $lastSeenAt, int $thresholdSeconds = 45): bool
    {
        if (!$lastSeenAt) {
            return false;
        }

        $timestamp = strtotime($lastSeenAt);

        return $timestamp !== false && $timestamp >= (time() - max(15, $thresholdSeconds));
    }
}
