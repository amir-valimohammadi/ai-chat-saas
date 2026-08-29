-- Security hardening for single-use impersonation tickets and session integrity.
-- Safe to run more than once. Orphaned sessions abort the migration before DDL changes.

DELIMITER $$

DROP PROCEDURE IF EXISTS `security_hardening_impersonation_sessions`$$

CREATE PROCEDURE `security_hardening_impersonation_sessions`()
BEGIN
  DECLARE orphan_sessions BIGINT UNSIGNED DEFAULT 0;

  SELECT COUNT(*) INTO orphan_sessions
  FROM `auth_sessions` AS session_row
  LEFT JOIN `users` AS session_user ON session_user.`id` = session_row.`user_id`
  WHERE session_user.`id` IS NULL;

  IF orphan_sessions > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Security hardening migration aborted: orphaned auth sessions exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admin_impersonations'
      AND COLUMN_NAME = 'used_at'
  ) THEN
    ALTER TABLE `admin_impersonations`
      ADD COLUMN `used_at` datetime DEFAULT NULL AFTER `ticket_expires_at`;
  END IF;

  UPDATE `admin_impersonations`
  SET `used_at` = `started_at`
  WHERE `used_at` IS NULL
    AND `started_at` IS NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'auth_sessions'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
  ) THEN
    ALTER TABLE `auth_sessions`
      ADD CONSTRAINT `fk_auth_sessions_user`
      FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$

CALL `security_hardening_impersonation_sessions`()$$
DROP PROCEDURE `security_hardening_impersonation_sessions`$$

DELIMITER ;
