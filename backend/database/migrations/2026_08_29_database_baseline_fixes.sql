-- Database baseline hardening for subscription tables.
-- Safe to run more than once. Existing invalid data aborts the migration before DDL changes.

DELIMITER $$

DROP PROCEDURE IF EXISTS `database_baseline_fix_subscription_schema`$$

CREATE PROCEDURE `database_baseline_fix_subscription_schema`()
BEGIN
  DECLARE invalid_rows BIGINT UNSIGNED DEFAULT 0;

  SELECT COUNT(*) INTO invalid_rows
  FROM `tenant_subscriptions`
  WHERE `ends_at` <= `starts_at` OR `price` < 0;

  IF invalid_rows > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Subscription baseline migration aborted: invalid dates or negative prices exist.';
  END IF;

  SELECT COUNT(*) INTO invalid_rows
  FROM `subscription_payments`
  WHERE `amount` < 0;

  IF invalid_rows > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Subscription baseline migration aborted: negative payment amounts exist.';
  END IF;

  ALTER TABLE `tenant_subscriptions`
    ENGINE = InnoDB,
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  ALTER TABLE `subscription_payments`
    ENGINE = InnoDB,
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tenant_subscriptions'
      AND CONSTRAINT_NAME = 'chk_subscription_dates'
      AND CONSTRAINT_TYPE = 'CHECK'
  ) THEN
    SET @baseline_sql = 'ALTER TABLE `tenant_subscriptions` ADD CONSTRAINT `chk_subscription_dates` CHECK (`ends_at` > `starts_at`)';
    PREPARE baseline_statement FROM @baseline_sql;
    EXECUTE baseline_statement;
    DEALLOCATE PREPARE baseline_statement;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tenant_subscriptions'
      AND CONSTRAINT_NAME = 'chk_subscription_price'
      AND CONSTRAINT_TYPE = 'CHECK'
  ) THEN
    SET @baseline_sql = 'ALTER TABLE `tenant_subscriptions` ADD CONSTRAINT `chk_subscription_price` CHECK (`price` >= 0)';
    PREPARE baseline_statement FROM @baseline_sql;
    EXECUTE baseline_statement;
    DEALLOCATE PREPARE baseline_statement;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'subscription_payments'
      AND CONSTRAINT_NAME = 'chk_payment_amount'
      AND CONSTRAINT_TYPE = 'CHECK'
  ) THEN
    SET @baseline_sql = 'ALTER TABLE `subscription_payments` ADD CONSTRAINT `chk_payment_amount` CHECK (`amount` >= 0)';
    PREPARE baseline_statement FROM @baseline_sql;
    EXECUTE baseline_statement;
    DEALLOCATE PREPARE baseline_statement;
  END IF;
END$$

CALL `database_baseline_fix_subscription_schema`()$$
DROP PROCEDURE `database_baseline_fix_subscription_schema`$$

DELIMITER ;
