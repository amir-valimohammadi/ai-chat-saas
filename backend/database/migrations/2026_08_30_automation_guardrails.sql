-- Automation guardrails added after the initial Automation Center rollout.
-- Existing policies become effective at migration time so historical
-- conversations are never marked overdue retroactively.

ALTER TABLE `automation_sla_policies`
  ADD COLUMN IF NOT EXISTS `effective_from` datetime NOT NULL DEFAULT current_timestamp() AFTER `site_id`;
