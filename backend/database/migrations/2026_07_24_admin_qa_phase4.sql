-- Admin QA Phase 4: deep security verification, tenant isolation and risk metadata.
-- Prerequisite: 2026_07_24_admin_qa_phase3.sql
-- Run exactly once.

ALTER TABLE `qa_test_runs`
  MODIFY COLUMN `profile` enum('quick','full','security','security_deep','operational','browser') NOT NULL DEFAULT 'quick';

ALTER TABLE `qa_test_run_items`
  ADD COLUMN `risk_score` decimal(4,1) DEFAULT NULL AFTER `evidence_json`,
  ADD COLUMN `confidence` enum('low','medium','high','confirmed') DEFAULT NULL AFTER `risk_score`,
  ADD COLUMN `owasp_category` varchar(100) DEFAULT NULL AFTER `confidence`,
  ADD COLUMN `cwe_id` varchar(40) DEFAULT NULL AFTER `owasp_category`,
  ADD COLUMN `affected_component` varchar(190) DEFAULT NULL AFTER `cwe_id`,
  ADD COLUMN `verification_mode` enum('static','runtime','database','configuration','hybrid') DEFAULT NULL AFTER `affected_component`,
  ADD KEY `idx_qa_test_items_security` (`run_id`,`risk_score`,`confidence`),
  ADD KEY `idx_qa_test_items_owasp` (`owasp_category`,`cwe_id`);

ALTER TABLE `qa_findings`
  ADD COLUMN `risk_score` decimal(4,1) DEFAULT NULL AFTER `evidence_json`,
  ADD COLUMN `confidence` enum('low','medium','high','confirmed') DEFAULT NULL AFTER `risk_score`,
  ADD COLUMN `owasp_category` varchar(100) DEFAULT NULL AFTER `confidence`,
  ADD COLUMN `cwe_id` varchar(40) DEFAULT NULL AFTER `owasp_category`,
  ADD COLUMN `affected_component` varchar(190) DEFAULT NULL AFTER `cwe_id`,
  ADD COLUMN `verification_mode` enum('static','runtime','database','configuration','hybrid') DEFAULT NULL AFTER `affected_component`,
  ADD KEY `idx_qa_findings_risk` (`status`,`risk_score`,`last_seen_at`),
  ADD KEY `idx_qa_findings_owasp` (`owasp_category`,`cwe_id`,`status`);

INSERT INTO `admin_permissions` (`code`,`name`,`group_name`,`description`) VALUES
('tests.run_security_deep','اجرای تست امنیت عمیق','تست و پایش','اجرای تست‌های دفاعی عمیق JWT، نشست، Permission، Tenant Isolation، Upload، CORS و Source Scan با تأیید رمز'),
('tests.view_security_evidence','مشاهده شواهد امنیتی','تست و پایش','مشاهده Risk Score، OWASP، CWE و شواهد فنی تست‌های امنیت عمیق')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`group_name`=VALUES(`group_name`),`description`=VALUES(`description`);

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r CROSS JOIN admin_permissions p
WHERE r.code='owner' AND p.code IN ('tests.run_security_deep','tests.view_security_evidence');

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p
  ON p.code IN ('tests.run_security_deep','tests.view_security_evidence')
WHERE r.code='operations';

INSERT IGNORE INTO `admin_role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM admin_roles r JOIN admin_permissions p
  ON p.code='tests.view_security_evidence'
WHERE r.code='analyst';

UPDATE `qa_test_run_items`
SET `risk_score` = CASE `severity`
    WHEN 'critical' THEN 10.0 WHEN 'high' THEN 8.0 WHEN 'medium' THEN 5.5 WHEN 'low' THEN 2.5 ELSE 0.0 END,
    `confidence` = COALESCE(`confidence`,'medium'),
    `verification_mode` = COALESCE(`verification_mode`,'configuration')
WHERE `risk_score` IS NULL AND (`category`='security' OR `case_key` LIKE 'security.%');

UPDATE `qa_findings`
SET `risk_score` = CASE `severity`
    WHEN 'critical' THEN 10.0 WHEN 'high' THEN 8.0 WHEN 'medium' THEN 5.5 WHEN 'low' THEN 2.5 ELSE 0.0 END,
    `confidence` = COALESCE(`confidence`,'medium'),
    `verification_mode` = COALESCE(`verification_mode`,'configuration')
WHERE `risk_score` IS NULL AND (`category`='security' OR `case_key` LIKE 'security.%');
