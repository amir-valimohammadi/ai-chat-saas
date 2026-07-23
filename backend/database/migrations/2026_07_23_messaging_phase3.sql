-- Messaging phase 3: delivery/read receipts, visitor activity and notification preferences.
-- Prerequisites:
--   1) 2026_07_23_messaging_features.sql
--   2) 2026_07_23_messaging_phase2.sql
-- Run this migration exactly once.

ALTER TABLE `messages`
  ADD COLUMN `delivered_at` datetime DEFAULT NULL AFTER `is_read`,
  ADD COLUMN `read_at` datetime DEFAULT NULL AFTER `delivered_at`,
  ADD KEY `idx_messages_delivery_status` (`conversation_id`,`sender_type`,`delivered_at`,`read_at`),
  ADD KEY `idx_messages_read_at` (`read_at`);

-- Preserve the meaning of the legacy is_read flag for existing records.
UPDATE `messages`
SET
  `delivered_at` = COALESCE(`delivered_at`, `created_at`),
  `read_at` = COALESCE(`read_at`, `created_at`)
WHERE `is_read` = 1;

ALTER TABLE `visitors`
  ADD COLUMN `last_seen_at` datetime DEFAULT NULL AFTER `user_agent`,
  ADD KEY `idx_visitors_last_seen_at` (`last_seen_at`);

CREATE TABLE `user_notification_preferences` (
  `user_id` int(10) UNSIGNED NOT NULL,
  `sound_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `browser_notifications_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `title_badge_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_notification_preferences_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
