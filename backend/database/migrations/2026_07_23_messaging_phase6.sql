-- Messaging phase 6: live visitors, page-view tracking and operator-initiated conversations.
-- Prerequisites: messaging phases 1 through 5.
-- Run this migration exactly once.

ALTER TABLE `visitors`
  ADD COLUMN `first_seen_at` datetime DEFAULT NULL AFTER `user_agent`,
  ADD COLUMN `current_page_url` varchar(1000) DEFAULT NULL AFTER `last_seen_at`,
  ADD COLUMN `current_page_title` varchar(255) DEFAULT NULL AFTER `current_page_url`,
  ADD COLUMN `referrer_url` varchar(1000) DEFAULT NULL AFTER `current_page_title`,
  ADD COLUMN `device_type` enum('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown' AFTER `referrer_url`,
  ADD COLUMN `browser_name` varchar(80) DEFAULT NULL AFTER `device_type`,
  ADD COLUMN `operating_system` varchar(80) DEFAULT NULL AFTER `browser_name`,
  ADD COLUMN `session_count` int(10) UNSIGNED NOT NULL DEFAULT 0 AFTER `operating_system`,
  ADD KEY `idx_visitors_site_presence` (`site_id`,`last_seen_at`,`device_type`),
  ADD KEY `idx_visitors_site_current_page` (`site_id`,`current_page_title`);

UPDATE `visitors`
SET `first_seen_at` = COALESCE(`first_seen_at`, `created_at`),
    `session_count` = CASE WHEN `session_count` = 0 THEN 1 ELSE `session_count` END;

CREATE TABLE `visitor_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `site_id` int(10) UNSIGNED NOT NULL,
  `visitor_id` int(10) UNSIGNED NOT NULL,
  `session_key` varchar(120) NOT NULL,
  `first_page_url` varchar(1000) DEFAULT NULL,
  `last_page_url` varchar(1000) DEFAULT NULL,
  `last_page_title` varchar(255) DEFAULT NULL,
  `referrer_url` varchar(1000) DEFAULT NULL,
  `device_type` enum('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  `browser_name` varchar(80) DEFAULT NULL,
  `operating_system` varchar(80) DEFAULT NULL,
  `page_view_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `total_active_seconds` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `widget_open` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `ended_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visitor_sessions_site_key` (`site_id`,`session_key`),
  KEY `idx_visitor_sessions_live` (`site_id`,`is_active`,`last_seen_at`),
  KEY `idx_visitor_sessions_visitor` (`visitor_id`,`last_seen_at`),
  CONSTRAINT `fk_visitor_sessions_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_visitor_sessions_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `visitor_page_views` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` bigint(20) UNSIGNED NOT NULL,
  `site_id` int(10) UNSIGNED NOT NULL,
  `visitor_id` int(10) UNSIGNED NOT NULL,
  `page_url` varchar(1000) NOT NULL,
  `page_title` varchar(255) DEFAULT NULL,
  `referrer_url` varchar(1000) DEFAULT NULL,
  `entered_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `duration_seconds` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `is_current` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_page_views_session_current` (`session_id`,`is_current`,`last_seen_at`),
  KEY `idx_page_views_visitor_time` (`visitor_id`,`entered_at`),
  KEY `idx_page_views_site_time` (`site_id`,`entered_at`),
  CONSTRAINT `fk_page_views_session` FOREIGN KEY (`session_id`) REFERENCES `visitor_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_page_views_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_page_views_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `visitor_operator_invites` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `site_id` int(10) UNSIGNED NOT NULL,
  `visitor_id` int(10) UNSIGNED NOT NULL,
  `session_id` bigint(20) UNSIGNED DEFAULT NULL,
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `department_id` int(10) UNSIGNED DEFAULT NULL,
  `operator_id` int(10) UNSIGNED NOT NULL,
  `message_id` int(10) UNSIGNED DEFAULT NULL,
  `message_preview` varchar(500) NOT NULL,
  `status` enum('pending','delivered','accepted','dismissed','expired') NOT NULL DEFAULT 'pending',
  `delivered_at` datetime DEFAULT NULL,
  `responded_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_operator_invites_delivery` (`visitor_id`,`status`,`expires_at`),
  KEY `idx_operator_invites_operator` (`operator_id`,`created_at`),
  KEY `idx_operator_invites_conversation` (`conversation_id`),
  CONSTRAINT `fk_operator_invites_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_session` FOREIGN KEY (`session_id`) REFERENCES `visitor_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
