<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

function notification_preferences_payload(array $row): array
{
    return [
        'sound_enabled' => (bool) ($row['sound_enabled'] ?? true),
        'browser_notifications_enabled' => (bool) ($row['browser_notifications_enabled'] ?? false),
        'title_badge_enabled' => (bool) ($row['title_badge_enabled'] ?? true),
    ];
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->prepare("\n            SELECT sound_enabled, browser_notifications_enabled, title_badge_enabled\n            FROM user_notification_preferences\n            WHERE user_id = :user_id\n            LIMIT 1\n        ");
        $stmt->execute([':user_id' => (int) $user['id']]);
        $row = $stmt->fetch() ?: [];

        json_response([
            'success' => true,
            'preferences' => notification_preferences_payload($row),
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response([
            'success' => false,
            'message' => 'Method not allowed',
        ], 405);
    }

    $input = get_json_input();
    $soundEnabled = !empty($input['sound_enabled']) ? 1 : 0;
    $browserEnabled = !empty($input['browser_notifications_enabled']) ? 1 : 0;
    $titleBadgeEnabled = array_key_exists('title_badge_enabled', $input)
        ? (!empty($input['title_badge_enabled']) ? 1 : 0)
        : 1;

    $stmt = $pdo->prepare("\n        INSERT INTO user_notification_preferences (\n            user_id,\n            sound_enabled,\n            browser_notifications_enabled,\n            title_badge_enabled\n        ) VALUES (\n            :user_id,\n            :sound_enabled,\n            :browser_notifications_enabled,\n            :title_badge_enabled\n        )\n        ON DUPLICATE KEY UPDATE\n            sound_enabled = VALUES(sound_enabled),\n            browser_notifications_enabled = VALUES(browser_notifications_enabled),\n            title_badge_enabled = VALUES(title_badge_enabled),\n            updated_at = NOW()\n    ");
    $stmt->execute([
        ':user_id' => (int) $user['id'],
        ':sound_enabled' => $soundEnabled,
        ':browser_notifications_enabled' => $browserEnabled,
        ':title_badge_enabled' => $titleBadgeEnabled,
    ]);

    json_response([
        'success' => true,
        'preferences' => notification_preferences_payload([
            'sound_enabled' => $soundEnabled,
            'browser_notifications_enabled' => $browserEnabled,
            'title_badge_enabled' => $titleBadgeEnabled,
        ]),
    ]);
} catch (Exception $e) {
    $payload = [
        'success' => false,
        'message' => 'Failed to load notification preferences',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
