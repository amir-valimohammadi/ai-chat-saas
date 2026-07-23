-- Messaging features: replies, edit/delete, revision history and voice/file message types.
-- Run once after the existing schema has been imported.

ALTER TABLE `messages`
  ADD COLUMN `reply_to_message_id` int(10) UNSIGNED DEFAULT NULL AFTER `sender_id`,
  ADD COLUMN `message_type` enum('text','file','voice','system') NOT NULL DEFAULT 'text' AFTER `sender_type`,
  ADD COLUMN `edited_at` datetime DEFAULT NULL AFTER `is_read`,
  ADD COLUMN `deleted_at` datetime DEFAULT NULL AFTER `edited_at`,
  ADD COLUMN `deleted_by_type` enum('visitor','agent','system') DEFAULT NULL AFTER `deleted_at`,
  ADD COLUMN `deleted_by_id` int(10) UNSIGNED DEFAULT NULL AFTER `deleted_by_type`,
  ADD KEY `idx_messages_reply_to` (`reply_to_message_id`),
  ADD KEY `idx_messages_deleted_at` (`deleted_at`),
  ADD CONSTRAINT `fk_messages_reply_to`
    FOREIGN KEY (`reply_to_message_id`) REFERENCES `messages` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `message_revisions` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` int(10) UNSIGNED NOT NULL,
  `editor_type` enum('visitor','agent','system') NOT NULL,
  `editor_id` int(10) UNSIGNED DEFAULT NULL,
  `action` enum('edit','delete') NOT NULL,
  `previous_content` text DEFAULT NULL,
  `new_content` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_message_revisions_message_id` (`message_id`),
  KEY `idx_message_revisions_created_at` (`created_at`),
  CONSTRAINT `fk_message_revisions_message`
    FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE `messages` AS m
INNER JOIN `message_attachments` AS a ON a.message_id = m.id
SET m.message_type = CASE
  WHEN a.mime_type LIKE 'audio/%' THEN 'voice'
  ELSE 'file'
END;

UPDATE `messages`
SET `message_type` = 'system'
WHERE `sender_type` = 'system';
