-- Admin Phase 2: Platform administrators, roles, permissions and security
-- Import once after 2026_07_24_admin_phase1.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `admin_roles` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` varchar(80) NOT NULL,
  `name` varchar(190) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_roles_code` (`code`),
  KEY `idx_admin_roles_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_permissions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` varchar(120) NOT NULL,
  `name` varchar(190) NOT NULL,
  `group_name` varchar(120) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_permissions_code` (`code`),
  KEY `idx_admin_permissions_group` (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_role_permissions` (
  `role_id` int(10) UNSIGNED NOT NULL,
  `permission_id` int(10) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `idx_admin_role_permissions_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS `admin_phase2_add_column`;
DELIMITER $$
CREATE PROCEDURE `admin_phase2_add_column`(
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

CALL admin_phase2_add_column('users', 'admin_role_id', 'int(10) UNSIGNED DEFAULT NULL AFTER `role`');
CALL admin_phase2_add_column('users', 'failed_login_attempts', 'smallint(5) UNSIGNED NOT NULL DEFAULT 0 AFTER `token_version`');
CALL admin_phase2_add_column('users', 'locked_until', 'datetime DEFAULT NULL AFTER `failed_login_attempts`');
CALL admin_phase2_add_column('users', 'must_change_password', 'tinyint(1) NOT NULL DEFAULT 0 AFTER `locked_until`');
CALL admin_phase2_add_column('users', 'two_factor_enabled', 'tinyint(1) NOT NULL DEFAULT 0 AFTER `must_change_password`');
CALL admin_phase2_add_column('users', 'two_factor_secret_encrypted', 'text DEFAULT NULL AFTER `two_factor_enabled`');
CALL admin_phase2_add_column('users', 'two_factor_confirmed_at', 'datetime DEFAULT NULL AFTER `two_factor_secret_encrypted`');
CALL admin_phase2_add_column('users', 'ip_allowlist_enabled', 'tinyint(1) NOT NULL DEFAULT 0 AFTER `two_factor_confirmed_at`');
CALL admin_phase2_add_column('users', 'last_login_ip', 'varchar(45) DEFAULT NULL AFTER `last_login_at`');

DROP PROCEDURE IF EXISTS `admin_phase2_add_column`;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `jti_hash` char(64) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `revoked_by` int(10) UNSIGNED DEFAULT NULL,
  `revocation_reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_sessions_jti` (`jti_hash`),
  KEY `idx_auth_sessions_user_active` (`user_id`,`revoked_at`,`expires_at`),
  KEY `idx_auth_sessions_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_login_attempts` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `email` varchar(190) NOT NULL,
  `success` tinyint(1) NOT NULL DEFAULT 0,
  `failure_reason` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_login_attempts_user` (`user_id`,`created_at`),
  KEY `idx_admin_login_attempts_email` (`email`,`created_at`),
  KEY `idx_admin_login_attempts_success` (`success`,`created_at`),
  KEY `idx_admin_login_attempts_ip` (`ip_address`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_security_events` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `event_type` varchar(100) NOT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `title` varchar(255) NOT NULL,
  `details_json` longtext DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_security_events_user` (`user_id`,`created_at`),
  KEY `idx_admin_security_events_open` (`resolved_at`,`severity`,`created_at`),
  KEY `idx_admin_security_events_type` (`event_type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_ip_allowlist` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `label` varchar(190) NOT NULL,
  `ip_cidr` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_ip_allowlist_user_cidr` (`user_id`,`ip_cidr`),
  KEY `idx_admin_ip_allowlist_active` (`user_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_two_factor_recovery_codes` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `code_hash` char(64) NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_two_factor_code_hash` (`code_hash`),
  KEY `idx_admin_two_factor_user_unused` (`user_id`,`used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `admin_permissions` (`code`,`name`,`group_name`,`description`) VALUES
('dashboard.view','مشاهده داشبورد','داشبورد','مشاهده آمار کلی پلتفرم'),
('requests.view','مشاهده درخواست‌ها','فروش','مشاهده درخواست‌های مشاوره و خرید'),
('requests.manage','مدیریت درخواست‌ها','فروش','ویرایش، پیگیری و تبدیل درخواست‌ها'),
('customers.view','مشاهده مشتریان','مشتریان','مشاهده مشتری، کاربران و مصرف'),
('customers.manage','مدیریت مشتریان','مشتریان','ساخت، تعلیق و تغییر پلن مشتری'),
('sites.view','مشاهده سایت‌ها','سایت‌ها','مشاهده سایت‌ها و وضعیت آن‌ها'),
('sites.manage','مدیریت سایت‌ها','سایت‌ها','تغییر تنظیمات و وضعیت سایت'),
('plans.view','مشاهده پلن‌ها','مالی','مشاهده پلن‌ها و محدودیت‌ها'),
('plans.manage','مدیریت پلن‌ها','مالی','ساخت و ویرایش پلن'),
('billing.view','مشاهده اشتراک و پرداخت','مالی','مشاهده اشتراک‌ها و سوابق پرداخت'),
('billing.manage','مدیریت اشتراک و پرداخت','مالی','تمدید، تغییر وضعیت و ثبت پرداخت'),
('ai.view','مشاهده نظارت AI','هوش مصنوعی','مشاهده مصرف و کیفیت AI'),
('operations.view','مشاهده سلامت سیستم','عملیات','مشاهده سرویس‌ها، خطاها و Jobها'),
('operations.manage','مدیریت عملیات سیستم','عملیات','Maintenance، Retry و رفع خطا'),
('audit.view','مشاهده گزارش فعالیت‌ها','امنیت','مشاهده Audit Log'),
('announcements.view','مشاهده اعلان‌ها','ارتباطات','مشاهده اعلان‌های پلتفرم'),
('announcements.manage','مدیریت اعلان‌ها','ارتباطات','ساخت و انتشار اعلان'),
('admins.view','مشاهده مدیران','مدیران','مشاهده مدیران و نقش‌ها'),
('admins.manage','مدیریت مدیران','مدیران','ساخت مدیر و تغییر نقش یا وضعیت'),
('security.view','مشاهده مرکز امنیت','امنیت','مشاهده ورودها، نشست‌ها و رویدادهای امنیتی'),
('security.manage','مدیریت مرکز امنیت','امنیت','لغو نشست، IP Allowlist و رفع هشدار')
ON DUPLICATE KEY UPDATE
`name`=VALUES(`name`),`group_name`=VALUES(`group_name`),`description`=VALUES(`description`);

INSERT INTO `admin_roles` (`code`,`name`,`description`,`is_system`,`is_active`) VALUES
('owner','مالک پلتفرم','دسترسی کامل و غیرقابل محدودسازی به همه بخش‌های مدیریتی',1,1),
('operations','مدیر عملیات','مدیریت سلامت سیستم، سایت‌ها و عملیات روزمره',1,1),
('support','مدیر پشتیبانی','پیگیری مشتریان، درخواست‌ها و کیفیت پاسخ',1,1),
('finance','مدیر مالی','مدیریت اشتراک‌ها، پرداخت‌ها و پلن‌ها',1,1),
('sales','مدیر فروش','مدیریت درخواست‌های فروش و ایجاد مشتری',1,1),
('analyst','تحلیل‌گر','دسترسی فقط‌خواندنی به گزارش‌ها و شاخص‌ها',1,1)
ON DUPLICATE KEY UPDATE
`name`=VALUES(`name`),`description`=VALUES(`description`),`is_system`=VALUES(`is_system`);

-- Owner receives every permission.
INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id, p.id FROM admin_roles r CROSS JOIN admin_permissions p WHERE r.code='owner';

-- Operations role.
INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN (
'dashboard.view','customers.view','sites.view','sites.manage','ai.view','operations.view','operations.manage','audit.view','announcements.view','announcements.manage','security.view'
) WHERE r.code='operations';

-- Support role.
INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN (
'dashboard.view','requests.view','requests.manage','customers.view','sites.view','ai.view','audit.view'
) WHERE r.code='support';

-- Finance role.
INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN (
'dashboard.view','customers.view','plans.view','plans.manage','billing.view','billing.manage','audit.view','security.view'
) WHERE r.code='finance';

-- Sales role.
INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN (
'dashboard.view','requests.view','requests.manage','customers.view','customers.manage','plans.view','billing.view','security.view'
) WHERE r.code='sales';

-- Analyst role.
INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN (
'dashboard.view','requests.view','customers.view','sites.view','plans.view','billing.view','ai.view','operations.view','audit.view','announcements.view'
) WHERE r.code='analyst';

UPDATE users
SET admin_role_id=(SELECT id FROM admin_roles WHERE code='owner' LIMIT 1)
WHERE role='super_admin' AND admin_role_id IS NULL;

-- Optional index created only if missing.
DROP PROCEDURE IF EXISTS `admin_phase2_add_index`;
DELIMITER $$
CREATE PROCEDURE `admin_phase2_add_index`(
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
CALL admin_phase2_add_index('users','idx_users_admin_role','`admin_role_id`,`is_active`');
CALL admin_phase2_add_index('users','idx_users_locked_until','`locked_until`');
DROP PROCEDURE IF EXISTS `admin_phase2_add_index`;
