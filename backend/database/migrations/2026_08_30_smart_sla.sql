-- Smart SLA: optional site business-time calculation and status-based pauses.
-- Defaults preserve the existing 24/7 behaviour for every installed policy.

ALTER TABLE `automation_sla_policies`
  ADD COLUMN IF NOT EXISTS `use_business_hours` tinyint(1) NOT NULL DEFAULT 0 AFTER `resolution_minutes`,
  ADD COLUMN IF NOT EXISTS `pause_statuses_json` longtext DEFAULT NULL AFTER `use_business_hours`;

ALTER TABLE `conversation_sla_status`
  ADD COLUMN IF NOT EXISTS `uses_business_hours` tinyint(1) NOT NULL DEFAULT 0 AFTER `policy_id`,
  ADD COLUMN IF NOT EXISTS `sla_timezone` varchar(80) NOT NULL DEFAULT 'Asia/Tehran' AFTER `uses_business_hours`,
  ADD COLUMN IF NOT EXISTS `pause_statuses_json` longtext DEFAULT NULL AFTER `sla_timezone`,
  ADD COLUMN IF NOT EXISTS `paused_at` datetime DEFAULT NULL AFTER `first_response_at`,
  ADD COLUMN IF NOT EXISTS `paused_status` varchar(50) DEFAULT NULL AFTER `paused_at`,
  ADD COLUMN IF NOT EXISTS `resolution_remaining_seconds` int(10) unsigned DEFAULT NULL AFTER `paused_status`,
  ADD COLUMN IF NOT EXISTS `total_paused_seconds` bigint(20) unsigned NOT NULL DEFAULT 0 AFTER `resolution_remaining_seconds`,
  ADD COLUMN IF NOT EXISTS `resolution_warning_sent_at` datetime DEFAULT NULL AFTER `warning_sent_at`,
  ADD COLUMN IF NOT EXISTS `resolved_at` datetime DEFAULT NULL AFTER `resolution_breached_at`;
