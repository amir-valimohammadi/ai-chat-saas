-- Admin Phase 3: Customer 360, support tooling, global search and secure impersonation
-- Import once after 2026_07_24_admin_phase2.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

DROP PROCEDURE IF EXISTS `admin_phase3_add_column`;
DELIMITER $$
CREATE PROCEDURE `admin_phase3_add_column`(
  IN p_table varchar(64),
  IN p_column varchar(64),
  IN p_definition text
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table
      AND column_name = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL admin_phase3_add_column('tenants', 'lifecycle_stage', 'enum(''onboarding'',''active'',''at_risk'',''paused'',''churned'') NOT NULL DEFAULT ''onboarding'' AFTER `status`');
CALL admin_phase3_add_column('tenants', 'suspension_reason', 'varchar(1000) DEFAULT NULL AFTER `lifecycle_stage`');
CALL admin_phase3_add_column('tenants', 'account_manager_id', 'int(10) UNSIGNED DEFAULT NULL AFTER `suspension_reason`');
CALL admin_phase3_add_column('tenants', 'onboarding_completed_at', 'datetime DEFAULT NULL AFTER `account_manager_id`');
CALL admin_phase3_add_column('auth_sessions', 'impersonation_id', 'bigint(20) UNSIGNED DEFAULT NULL AFTER `revocation_reason`');
CALL admin_phase3_add_column('auth_sessions', 'parent_admin_user_id', 'int(10) UNSIGNED DEFAULT NULL AFTER `impersonation_id`');

-- مشتریان موجودی که قبلاً حساب و سایت فعال داشته‌اند، راه‌اندازی‌شده در نظر گرفته می‌شوند.
UPDATE `tenants` t
SET t.`lifecycle_stage`='active',
    t.`onboarding_completed_at`=COALESCE(t.`onboarding_completed_at`,NOW())
WHERE t.`status`='active'
  AND EXISTS (SELECT 1 FROM `users` u WHERE u.`tenant_id`=t.`id` AND u.`role`='customer_admin')
  AND EXISTS (SELECT 1 FROM `sites` s WHERE s.`tenant_id`=t.`id`);

DROP PROCEDURE IF EXISTS `admin_phase3_add_column`;

CREATE TABLE IF NOT EXISTS `tenant_tags` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `slug` varchar(140) NOT NULL,
  `color` varchar(20) NOT NULL DEFAULT '#64748b',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_tags_slug` (`slug`),
  KEY `idx_tenant_tags_active` (`is_active`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_tag_assignments` (
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `tag_id` int(10) UNSIGNED NOT NULL,
  `assigned_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`tenant_id`,`tag_id`),
  KEY `idx_tenant_tag_assignments_tag` (`tag_id`,`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_notes` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `author_user_id` int(10) UNSIGNED NOT NULL,
  `body` text NOT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tenant_notes_tenant` (`tenant_id`,`is_pinned`,`created_at`),
  KEY `idx_tenant_notes_author` (`author_user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_onboarding_items` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `item_key` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `status` enum('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
  `sort_order` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `due_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_onboarding_item` (`tenant_id`,`item_key`),
  KEY `idx_tenant_onboarding_status` (`tenant_id`,`status`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_impersonations` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_user_id` int(10) UNSIGNED NOT NULL,
  `target_user_id` int(10) UNSIGNED NOT NULL,
  `tenant_id` int(10) UNSIGNED NOT NULL,
  `reason` varchar(1000) NOT NULL,
  `ticket_hash` char(64) NOT NULL,
  `status` enum('issued','active','ended','expired','revoked') NOT NULL DEFAULT 'issued',
  `target_session_id` bigint(20) UNSIGNED DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `ticket_expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `ended_by` int(10) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_impersonations_ticket` (`ticket_hash`),
  KEY `idx_admin_impersonations_admin` (`admin_user_id`,`status`,`created_at`),
  KEY `idx_admin_impersonations_target` (`tenant_id`,`target_user_id`,`status`),
  KEY `idx_admin_impersonations_expiry` (`status`,`ticket_expires_at`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `tenant_tags` (`name`,`slug`,`color`,`is_active`) VALUES
('VIP','vip','#7c3aed',1),
('نیازمند پیگیری','follow-up','#ea580c',1),
('بدهکار','past-due','#dc2626',1),
('آزمایشی','trial','#0284c7',1),
('ریسک ریزش','churn-risk','#be123c',1),
('مشتری کلیدی','key-account','#059669',1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`color`=VALUES(`color`),`is_active`=VALUES(`is_active`);

INSERT IGNORE INTO `tenant_onboarding_items` (`tenant_id`,`item_key`,`title`,`sort_order`)
SELECT id,'account_created','ساخت حساب مدیر مشتری',10 FROM tenants;
INSERT IGNORE INTO `tenant_onboarding_items` (`tenant_id`,`item_key`,`title`,`sort_order`)
SELECT id,'site_created','ساخت اولین سایت',20 FROM tenants;
INSERT IGNORE INTO `tenant_onboarding_items` (`tenant_id`,`item_key`,`title`,`sort_order`)
SELECT id,'widget_installed','نصب و تأیید ویجت',30 FROM tenants;
INSERT IGNORE INTO `tenant_onboarding_items` (`tenant_id`,`item_key`,`title`,`sort_order`)
SELECT id,'team_invited','دعوت اعضای تیم',40 FROM tenants;
INSERT IGNORE INTO `tenant_onboarding_items` (`tenant_id`,`item_key`,`title`,`sort_order`)
SELECT id,'knowledge_ready','تکمیل منبع دانش',50 FROM tenants;
INSERT IGNORE INTO `tenant_onboarding_items` (`tenant_id`,`item_key`,`title`,`sort_order`)
SELECT id,'first_conversation','ثبت اولین گفتگو',60 FROM tenants;

INSERT INTO `admin_permissions` (`code`,`name`,`group_name`,`description`) VALUES
('customers.support','ابزارهای پشتیبانی مشتری','مشتریان','مدیریت یادداشت، برچسب، Timeline و چک‌لیست مشتری'),
('customers.impersonate','ورود موقت به حساب مشتری','مشتریان','ورود موقت و ممیزی‌شده به پنل مشتری'),
('customers.export','خروجی اطلاعات مشتری','مشتریان','دریافت خروجی JSON یا CSV پرونده مشتری')
ON DUPLICATE KEY UPDATE
`name`=VALUES(`name`),`group_name`=VALUES(`group_name`),`description`=VALUES(`description`);

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r CROSS JOIN admin_permissions p
WHERE r.code='owner' AND p.code IN ('customers.support','customers.impersonate','customers.export');

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p
  ON p.code IN ('customers.support','customers.impersonate','customers.export')
WHERE r.code IN ('operations','support');

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p
  ON p.code IN ('customers.support','customers.export')
WHERE r.code='sales';

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p
  ON p.code='customers.export'
WHERE r.code IN ('finance','analyst');

DROP PROCEDURE IF EXISTS `admin_phase3_add_index`;
DELIMITER $$
CREATE PROCEDURE `admin_phase3_add_index`(
  IN p_table varchar(64),
  IN p_index varchar(64),
  IN p_columns varchar(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name=p_table AND index_name=p_index
  ) THEN
    SET @sql=CONCAT('ALTER TABLE `',p_table,'` ADD INDEX `',p_index,'` (',p_columns,')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;
CALL admin_phase3_add_index('tenants','idx_tenants_lifecycle','`lifecycle_stage`,`status`');
CALL admin_phase3_add_index('tenants','idx_tenants_account_manager','`account_manager_id`,`status`');
CALL admin_phase3_add_index('auth_sessions','idx_auth_sessions_impersonation','`impersonation_id`,`revoked_at`,`expires_at`');
DROP PROCEDURE IF EXISTS `admin_phase3_add_index`;
