-- Subscription core + manual payments
-- Run this file once in phpMyAdmin after selecting the ai_chat_saas database.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `tenant_subscriptions` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int UNSIGNED NOT NULL,
  `plan_id` int UNSIGNED NOT NULL,
  `status` enum('trial','active','past_due','expired','cancelled','suspended') NOT NULL DEFAULT 'active',
  `billing_cycle` enum('monthly','quarterly','yearly','manual') NOT NULL DEFAULT 'manual',
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `trial_ends_at` datetime DEFAULT NULL,
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0,
  `price` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency` char(3) NOT NULL DEFAULT 'IRR',
  `created_by` int UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_subscription_tenant_status_end` (`tenant_id`,`status`,`ends_at`),
  KEY `idx_subscription_plan` (`plan_id`),
  KEY `idx_subscription_end` (`ends_at`),
  KEY `idx_subscription_created_by` (`created_by`),
  CONSTRAINT `fk_subscription_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_subscription_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_subscription_dates` CHECK (`ends_at` > `starts_at`),
  CONSTRAINT `chk_subscription_price` CHECK (`price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_payments` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int UNSIGNED NOT NULL,
  `subscription_id` bigint UNSIGNED NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'IRR',
  `payment_method` varchar(50) NOT NULL DEFAULT 'manual',
  `reference_number` varchar(190) DEFAULT NULL,
  `status` enum('pending','paid','failed','refunded','cancelled') NOT NULL DEFAULT 'paid',
  `paid_at` datetime DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `created_by` int UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_reference` (`reference_number`),
  KEY `idx_payment_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_payment_subscription` (`subscription_id`),
  KEY `idx_payment_status_paid` (`status`,`paid_at`),
  KEY `idx_payment_created_by` (`created_by`),
  CONSTRAINT `fk_payment_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payment_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payment_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_payment_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: one manual, one-year subscription for every existing tenant with a plan.
INSERT INTO `tenant_subscriptions`
  (`tenant_id`, `plan_id`, `status`, `billing_cycle`, `starts_at`, `ends_at`, `trial_ends_at`, `auto_renew`, `price`, `currency`, `created_by`)
SELECT
  t.id,
  t.plan_id,
  CASE WHEN t.status = 'active' THEN 'active' ELSE 'suspended' END,
  'manual',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 1 YEAR),
  NULL,
  0,
  COALESCE(p.price_monthly, 0),
  'IRR',
  NULL
FROM tenants t
INNER JOIN plans p ON p.id = t.plan_id
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_subscriptions s WHERE s.tenant_id = t.id
);

COMMIT;

