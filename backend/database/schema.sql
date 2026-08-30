-- AI Chat SaaS canonical database schema.
-- Generated from the validated 2026-08-29 backup after applying all project migrations.
-- Structure only: this file must never contain tenant, user, session, message, or secret data.

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `actor_user_id` int(10) unsigned DEFAULT NULL,
  `actor_name` varchar(190) DEFAULT NULL,
  `actor_email` varchar(190) DEFAULT NULL,
  `actor_role` varchar(50) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` int(10) unsigned DEFAULT NULL,
  `tenant_id` int(10) unsigned DEFAULT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `target_user_id` int(10) unsigned DEFAULT NULL,
  `plan_id` int(10) unsigned DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `old_values_json` longtext DEFAULT NULL,
  `new_values_json` longtext DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit_actor` (`actor_user_id`),
  KEY `idx_admin_audit_action` (`action`),
  KEY `idx_admin_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_admin_audit_tenant` (`tenant_id`),
  KEY `idx_admin_audit_site` (`site_id`),
  KEY `idx_admin_audit_target_user` (`target_user_id`),
  KEY `idx_admin_audit_plan` (`plan_id`),
  KEY `idx_admin_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_impersonations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `admin_user_id` int(10) unsigned NOT NULL,
  `target_user_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `reason` varchar(1000) NOT NULL,
  `ticket_hash` char(64) NOT NULL,
  `status` enum('issued','active','ended','expired','revoked') NOT NULL DEFAULT 'issued',
  `target_session_id` bigint(20) unsigned DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `ticket_expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `ended_by` int(10) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_impersonations_ticket` (`ticket_hash`),
  KEY `idx_admin_impersonations_admin` (`admin_user_id`,`status`,`created_at`),
  KEY `idx_admin_impersonations_target` (`tenant_id`,`target_user_id`,`status`),
  KEY `idx_admin_impersonations_expiry` (`status`,`ticket_expires_at`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_ip_allowlist` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `label` varchar(190) NOT NULL,
  `ip_cidr` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_ip_allowlist_user_cidr` (`user_id`,`ip_cidr`),
  KEY `idx_admin_ip_allowlist_active` (`user_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_login_attempts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_permissions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(120) NOT NULL,
  `name` varchar(190) NOT NULL,
  `group_name` varchar(120) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_permissions_code` (`code`),
  KEY `idx_admin_permissions_group` (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_role_permissions` (
  `role_id` int(10) unsigned NOT NULL,
  `permission_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `idx_admin_role_permissions_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(80) NOT NULL,
  `name` varchar(190) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_roles_code` (`code`),
  KEY `idx_admin_roles_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_security_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `event_type` varchar(100) NOT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `title` varchar(255) NOT NULL,
  `details_json` longtext DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_security_events_user` (`user_id`,`created_at`),
  KEY `idx_admin_security_events_open` (`resolved_at`,`severity`,`created_at`),
  KEY `idx_admin_security_events_type` (`event_type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_two_factor_recovery_codes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `code_hash` char(64) NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_two_factor_code_hash` (`code_hash`),
  KEY `idx_admin_two_factor_user_unused` (`user_id`,`used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `agent_site_access` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_site` (`user_id`,`site_id`),
  KEY `fk_agent_site_site` (`site_id`),
  CONSTRAINT `fk_agent_site_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_site_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_answer_logs` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `conversation_id` int(10) unsigned DEFAULT NULL,
  `message_id` int(10) unsigned DEFAULT NULL,
  `user_question` text NOT NULL,
  `normalized_question` text DEFAULT NULL,
  `reply_text` text DEFAULT NULL,
  `confidence_score` decimal(6,2) NOT NULL DEFAULT 0.00,
  `matched_chunk_id` int(10) unsigned DEFAULT NULL,
  `matched_question_id` int(10) unsigned DEFAULT NULL,
  `sources_json` longtext DEFAULT NULL,
  `reply_mode` enum('suggestion','auto_reply','fallback','no_answer') NOT NULL DEFAULT 'suggestion',
  `request_source` enum('test','widget','agent','auto_reply') NOT NULL DEFAULT 'agent',
  `failure_reason` enum('no_candidate','low_confidence','question_too_short','assistant_disabled','auto_reply_disabled','support_online','plan_restricted','site_ai_mode_off','unknown') DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ai_answer_logs_site` (`site_id`),
  KEY `idx_ai_answer_logs_conversation` (`conversation_id`),
  KEY `idx_ai_answer_logs_message` (`message_id`),
  KEY `idx_ai_answer_logs_confidence` (`confidence_score`),
  KEY `idx_ai_answer_logs_tenant` (`tenant_id`),
  KEY `idx_ai_answer_logs_chunk` (`matched_chunk_id`),
  KEY `idx_ai_answer_logs_question` (`matched_question_id`),
  KEY `idx_ai_answer_logs_source_created` (`request_source`,`created_at`),
  KEY `idx_ai_answer_logs_failure_reason` (`failure_reason`),
  CONSTRAINT `fk_ai_answer_logs_chunk` FOREIGN KEY (`matched_chunk_id`) REFERENCES `ai_content_chunks` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_answer_logs_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_answer_logs_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_answer_logs_question` FOREIGN KEY (`matched_question_id`) REFERENCES `ai_generated_questions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_answer_logs_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_answer_logs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_content_chunks` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `page_id` int(10) unsigned NOT NULL,
  `chunk_index` int(10) unsigned NOT NULL DEFAULT 0,
  `heading` varchar(500) DEFAULT NULL,
  `chunk_text` text NOT NULL,
  `normalized_text` text DEFAULT NULL,
  `category` varchar(120) DEFAULT NULL,
  `detected_intent` varchar(120) DEFAULT NULL,
  `keywords_json` longtext DEFAULT NULL,
  `importance_score` decimal(6,2) NOT NULL DEFAULT 0.00,
  `content_hash` char(64) NOT NULL,
  `status` enum('active','ignored','archived') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_chunks_page_hash` (`page_id`,`content_hash`),
  KEY `idx_ai_chunks_site_category` (`site_id`,`category`),
  KEY `idx_ai_chunks_site_intent` (`site_id`,`detected_intent`),
  KEY `idx_ai_chunks_tenant` (`tenant_id`),
  KEY `idx_ai_chunks_page` (`page_id`),
  KEY `idx_ai_chunks_score` (`importance_score`),
  FULLTEXT KEY `ft_ai_chunks_search` (`heading`,`chunk_text`,`normalized_text`),
  CONSTRAINT `fk_ai_chunks_page` FOREIGN KEY (`page_id`) REFERENCES `ai_pages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_chunks_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_chunks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_crawl_queue` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `crawl_run_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `source_id` int(10) unsigned DEFAULT NULL,
  `item_type` enum('page','sitemap') NOT NULL DEFAULT 'page',
  `url` varchar(1000) NOT NULL,
  `url_hash` char(64) NOT NULL,
  `depth` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `path_prefix` varchar(1000) DEFAULT NULL,
  `discovered_from_url` varchar(1000) DEFAULT NULL,
  `status` enum('queued','processing','completed','failed','ignored','skipped') NOT NULL DEFAULT 'queued',
  `status_code` smallint(5) unsigned DEFAULT NULL,
  `error_message` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_crawl_queue_run_url_type` (`crawl_run_id`,`url_hash`,`item_type`),
  KEY `idx_ai_crawl_queue_run_status` (`crawl_run_id`,`status`,`item_type`),
  KEY `idx_ai_crawl_queue_site` (`tenant_id`,`site_id`),
  KEY `idx_ai_crawl_queue_source` (`source_id`),
  KEY `fk_ai_crawl_queue_site` (`site_id`),
  CONSTRAINT `fk_ai_crawl_queue_run` FOREIGN KEY (`crawl_run_id`) REFERENCES `ai_crawl_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_crawl_queue_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_crawl_queue_source` FOREIGN KEY (`source_id`) REFERENCES `ai_crawl_sources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_crawl_queue_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_crawl_runs` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `started_by` int(10) unsigned DEFAULT NULL,
  `status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  `current_stage` varchar(50) NOT NULL DEFAULT 'queued',
  `current_message` varchar(500) DEFAULT NULL,
  `current_url` varchar(1000) DEFAULT NULL,
  `progress_percent` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `page_limit` int(10) unsigned NOT NULL DEFAULT 30,
  `max_depth` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `total_urls` int(10) unsigned NOT NULL DEFAULT 0,
  `queued_urls` int(10) unsigned NOT NULL DEFAULT 0,
  `processed_urls` int(10) unsigned NOT NULL DEFAULT 0,
  `fetched_pages` int(10) unsigned NOT NULL DEFAULT 0,
  `failed_pages` int(10) unsigned NOT NULL DEFAULT 0,
  `created_chunks` int(10) unsigned NOT NULL DEFAULT 0,
  `created_terms` int(10) unsigned NOT NULL DEFAULT 0,
  `created_questions` int(10) unsigned NOT NULL DEFAULT 0,
  `unchanged_pages` int(10) unsigned NOT NULL DEFAULT 0,
  `preserved_questions` int(10) unsigned NOT NULL DEFAULT 0,
  `archived_questions` int(10) unsigned NOT NULL DEFAULT 0,
  `error_message` text DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  `last_activity_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ai_crawl_runs_site_status` (`site_id`,`status`),
  KEY `idx_ai_crawl_runs_tenant` (`tenant_id`),
  KEY `fk_ai_crawl_runs_started_by` (`started_by`),
  CONSTRAINT `fk_ai_crawl_runs_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_crawl_runs_started_by` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_crawl_runs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_crawl_sources` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `source_type` enum('url','path_prefix','sitemap') NOT NULL DEFAULT 'url',
  `source_value` varchar(1000) NOT NULL,
  `label` varchar(255) DEFAULT NULL,
  `category_hint` varchar(120) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `last_crawled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ai_crawl_sources_site` (`site_id`,`is_active`),
  KEY `idx_ai_crawl_sources_tenant` (`tenant_id`),
  KEY `fk_ai_crawl_sources_created_by` (`created_by`),
  CONSTRAINT `fk_ai_crawl_sources_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_crawl_sources_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_crawl_sources_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_generated_questions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `page_id` int(10) unsigned DEFAULT NULL,
  `chunk_id` int(10) unsigned DEFAULT NULL,
  `question` text NOT NULL,
  `normalized_question` text DEFAULT NULL,
  `origin_question_hash` char(64) DEFAULT NULL,
  `answer_text` text DEFAULT NULL,
  `category` varchar(120) DEFAULT NULL,
  `detected_intent` varchar(120) DEFAULT NULL,
  `source_type` varchar(50) NOT NULL DEFAULT 'template',
  `is_user_edited` tinyint(1) NOT NULL DEFAULT 0,
  `source_chunk_hash` char(64) DEFAULT NULL,
  `last_seen_crawl_run_id` int(10) unsigned DEFAULT NULL,
  `preserved_at` datetime DEFAULT NULL,
  `score` decimal(6,2) NOT NULL DEFAULT 0.00,
  `status` enum('active','ignored','archived') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ai_questions_site_category` (`site_id`,`category`),
  KEY `idx_ai_questions_site_intent` (`site_id`,`detected_intent`),
  KEY `idx_ai_questions_page` (`page_id`),
  KEY `idx_ai_questions_chunk` (`chunk_id`),
  KEY `idx_ai_questions_score` (`score`),
  KEY `idx_ai_questions_tenant` (`tenant_id`),
  KEY `idx_ai_questions_origin_hash` (`site_id`,`origin_question_hash`),
  KEY `idx_ai_questions_page_edited` (`page_id`,`is_user_edited`),
  KEY `idx_ai_questions_source_chunk_hash` (`page_id`,`source_chunk_hash`),
  KEY `idx_ai_questions_last_seen_run` (`last_seen_crawl_run_id`),
  FULLTEXT KEY `ft_ai_questions_search` (`question`,`normalized_question`,`answer_text`),
  CONSTRAINT `fk_ai_questions_chunk` FOREIGN KEY (`chunk_id`) REFERENCES `ai_content_chunks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_questions_page` FOREIGN KEY (`page_id`) REFERENCES `ai_pages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_questions_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_questions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_pages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `crawl_run_id` int(10) unsigned DEFAULT NULL,
  `source_id` int(10) unsigned DEFAULT NULL,
  `url` varchar(1000) NOT NULL,
  `url_hash` char(64) NOT NULL,
  `title` varchar(500) DEFAULT NULL,
  `meta_description` text DEFAULT NULL,
  `main_heading` varchar(500) DEFAULT NULL,
  `clean_text` mediumtext DEFAULT NULL,
  `content_hash` char(64) DEFAULT NULL,
  `category` varchar(120) DEFAULT NULL,
  `detected_intent` varchar(120) DEFAULT NULL,
  `status_code` smallint(5) unsigned DEFAULT NULL,
  `crawl_status` enum('pending','success','failed','ignored') NOT NULL DEFAULT 'pending',
  `word_count` int(10) unsigned NOT NULL DEFAULT 0,
  `last_crawled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_pages_site_url_hash` (`site_id`,`url_hash`),
  KEY `idx_ai_pages_site_category` (`site_id`,`category`),
  KEY `idx_ai_pages_tenant` (`tenant_id`),
  KEY `idx_ai_pages_crawl_run` (`crawl_run_id`),
  KEY `idx_ai_pages_source` (`source_id`),
  KEY `idx_ai_pages_status` (`crawl_status`),
  FULLTEXT KEY `ft_ai_pages_text` (`title`,`main_heading`,`clean_text`),
  CONSTRAINT `fk_ai_pages_crawl_run` FOREIGN KEY (`crawl_run_id`) REFERENCES `ai_crawl_runs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_pages_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_pages_source` FOREIGN KEY (`source_id`) REFERENCES `ai_crawl_sources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_pages_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_site_settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `assistant_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `auto_reply_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `crawl_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `min_auto_reply_score` decimal(5,2) NOT NULL DEFAULT 75.00,
  `min_suggestion_score` decimal(5,2) NOT NULL DEFAULT 45.00,
  `max_pages_per_crawl` int(10) unsigned NOT NULL DEFAULT 30,
  `max_depth` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `fallback_message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_site_settings_site` (`site_id`),
  KEY `idx_ai_site_settings_tenant` (`tenant_id`),
  CONSTRAINT `fk_ai_site_settings_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_site_settings_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_suggestions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(10) unsigned NOT NULL,
  `message_id` int(10) unsigned NOT NULL,
  `suggested_reply` text NOT NULL,
  `confidence` decimal(4,2) DEFAULT 0.00,
  `sources_json` text DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ai_suggestions_conversation_id` (`conversation_id`),
  KEY `idx_ai_suggestions_message_id` (`message_id`),
  KEY `idx_ai_suggestions_status` (`status`),
  CONSTRAINT `fk_ai_suggestions_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_suggestions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_terms` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `page_id` int(10) unsigned DEFAULT NULL,
  `chunk_id` int(10) unsigned DEFAULT NULL,
  `term` varchar(255) NOT NULL,
  `normalized_term` varchar(255) NOT NULL,
  `term_type` enum('word','phrase','category','intent') NOT NULL DEFAULT 'word',
  `category` varchar(120) DEFAULT NULL,
  `detected_intent` varchar(120) DEFAULT NULL,
  `frequency` int(10) unsigned NOT NULL DEFAULT 1,
  `score` decimal(8,3) NOT NULL DEFAULT 0.000,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ai_terms_site_term` (`site_id`,`normalized_term`),
  KEY `idx_ai_terms_site_type` (`site_id`,`term_type`),
  KEY `idx_ai_terms_score` (`score`),
  KEY `idx_ai_terms_page` (`page_id`),
  KEY `idx_ai_terms_chunk` (`chunk_id`),
  KEY `idx_ai_terms_tenant` (`tenant_id`),
  CONSTRAINT `fk_ai_terms_chunk` FOREIGN KEY (`chunk_id`) REFERENCES `ai_content_chunks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_terms_page` FOREIGN KEY (`page_id`) REFERENCES `ai_pages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_terms_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_terms_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_unanswered_questions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `conversation_id` int(10) unsigned DEFAULT NULL,
  `message_id` int(10) unsigned DEFAULT NULL,
  `question` text NOT NULL,
  `normalized_question` text DEFAULT NULL,
  `question_hash` char(64) NOT NULL,
  `detected_category` varchar(120) DEFAULT NULL,
  `detected_intent` varchar(120) DEFAULT NULL,
  `best_match_score` decimal(6,2) NOT NULL DEFAULT 0.00,
  `best_sources_json` longtext DEFAULT NULL,
  `occurrence_count` int(10) unsigned NOT NULL DEFAULT 1,
  `first_seen_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL,
  `failure_reason` enum('no_candidate','low_confidence','question_too_short','unknown') DEFAULT NULL,
  `status` enum('new','reviewed','added_to_knowledge','ignored') NOT NULL DEFAULT 'new',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_unanswered_question_hash` (`tenant_id`,`site_id`,`question_hash`),
  KEY `idx_ai_unanswered_site_status` (`site_id`,`status`),
  KEY `idx_ai_unanswered_conversation` (`conversation_id`),
  KEY `idx_ai_unanswered_message` (`message_id`),
  KEY `idx_ai_unanswered_tenant` (`tenant_id`),
  KEY `idx_ai_unanswered_priority` (`tenant_id`,`site_id`,`status`,`occurrence_count`,`last_seen_at`),
  FULLTEXT KEY `ft_ai_unanswered_search` (`question`,`normalized_question`),
  CONSTRAINT `fk_ai_unanswered_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_unanswered_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_unanswered_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_unanswered_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcement_targets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `announcement_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_announcement_tenant` (`announcement_id`,`tenant_id`),
  KEY `idx_announcement_targets_tenant` (`tenant_id`),
  CONSTRAINT `fk_announcement_targets_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_announcement_targets_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcement_user_states` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `announcement_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned DEFAULT NULL,
  `user_id` int(10) unsigned NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `dismissed_at` datetime DEFAULT NULL,
  `clicked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_announcement_user` (`announcement_id`,`user_id`),
  KEY `idx_announcement_states_user` (`user_id`),
  KEY `idx_announcement_states_tenant` (`tenant_id`),
  CONSTRAINT `fk_announcement_states_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_announcement_states_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_announcement_states_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcements` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(190) NOT NULL,
  `body` text NOT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `type` enum('info','warning','discount','update','danger') NOT NULL DEFAULT 'info',
  `priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `target_type` enum('all','selected') NOT NULL DEFAULT 'all',
  `cta_label` varchar(120) DEFAULT NULL,
  `cta_url` varchar(500) DEFAULT NULL,
  `starts_at` datetime DEFAULT NULL,
  `ends_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_dismissible` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_announcements_active` (`is_active`),
  KEY `idx_announcements_target_type` (`target_type`),
  KEY `idx_announcements_dates` (`starts_at`,`ends_at`),
  KEY `fk_announcements_created_by` (`created_by`),
  CONSTRAINT `fk_announcements_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `api_rate_limits` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `rate_key` varchar(191) NOT NULL,
  `action` varchar(100) NOT NULL,
  `identifier_hash` char(64) NOT NULL,
  `hits` int(10) unsigned NOT NULL DEFAULT 1,
  `window_start` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rate_key` (`rate_key`),
  KEY `idx_api_rate_limits_action` (`action`),
  KEY `idx_api_rate_limits_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_sessions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `jti_hash` char(64) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `revoked_by` int(10) unsigned DEFAULT NULL,
  `revocation_reason` varchar(255) DEFAULT NULL,
  `impersonation_id` bigint(20) unsigned DEFAULT NULL,
  `parent_admin_user_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_sessions_jti` (`jti_hash`),
  KEY `idx_auth_sessions_user_active` (`user_id`,`revoked_at`,`expires_at`),
  KEY `idx_auth_sessions_last_seen` (`last_seen_at`),
  KEY `idx_auth_sessions_impersonation` (`impersonation_id`,`revoked_at`,`expires_at`),
  CONSTRAINT `fk_auth_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversation_assignment_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(10) unsigned NOT NULL,
  `department_id` int(10) unsigned DEFAULT NULL,
  `from_agent_id` int(10) unsigned DEFAULT NULL,
  `to_agent_id` int(10) unsigned DEFAULT NULL,
  `action` enum('queued','auto_assigned','manual_assigned','unassigned','department_transfer','queue_reassigned') NOT NULL,
  `assignment_method` enum('manual','round_robin','least_busy','system') DEFAULT NULL,
  `actor_user_id` int(10) unsigned DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_assignment_logs_conversation` (`conversation_id`,`created_at`),
  KEY `idx_assignment_logs_department` (`department_id`,`created_at`),
  KEY `fk_assignment_logs_from_agent` (`from_agent_id`),
  KEY `fk_assignment_logs_to_agent` (`to_agent_id`),
  KEY `fk_assignment_logs_actor` (`actor_user_id`),
  CONSTRAINT `fk_assignment_logs_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_logs_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_logs_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_logs_from_agent` FOREIGN KEY (`from_agent_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_logs_to_agent` FOREIGN KEY (`to_agent_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversation_typing_status` (
  `conversation_id` int(11) NOT NULL,
  `sender_type` varchar(20) NOT NULL,
  `actor_id` int(11) NOT NULL,
  `is_typing` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`conversation_id`,`sender_type`,`actor_id`),
  KEY `idx_typing_lookup` (`conversation_id`,`sender_type`,`is_typing`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `visitor_id` int(10) unsigned NOT NULL,
  `assigned_agent_id` int(10) unsigned DEFAULT NULL,
  `department_id` int(10) unsigned DEFAULT NULL,
  `queue_status` enum('none','waiting','assigned') NOT NULL DEFAULT 'none',
  `queue_position` int(10) unsigned DEFAULT NULL,
  `queued_at` datetime DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `assignment_method` enum('manual','round_robin','least_busy','system') DEFAULT NULL,
  `status` enum('new','open','in_progress','waiting_customer','follow_up','pending','closed') NOT NULL DEFAULT 'new',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `pinned_at` datetime DEFAULT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `source_page_url` text DEFAULT NULL,
  `source_page_title` varchar(255) DEFAULT NULL,
  `ai_summary` text DEFAULT NULL,
  `ai_category` varchar(100) DEFAULT NULL,
  `last_message_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_conversations_site_status` (`site_id`,`status`),
  KEY `idx_conversations_visitor_id` (`visitor_id`),
  KEY `idx_conversations_agent_id` (`assigned_agent_id`),
  KEY `idx_conversations_last_message_at` (`last_message_at`),
  KEY `idx_conversations_assigned_agent_id` (`assigned_agent_id`),
  KEY `idx_conversations_inbox_management` (`site_id`,`is_archived`,`is_pinned`,`priority`,`last_message_at`),
  KEY `idx_conversations_assigned_status` (`assigned_agent_id`,`status`,`is_archived`),
  KEY `idx_conversations_department_queue` (`department_id`,`queue_status`,`queue_position`,`queued_at`),
  KEY `idx_conversations_agent_active_load` (`assigned_agent_id`,`status`,`is_archived`,`closed_at`),
  CONSTRAINT `fk_conversations_agent` FOREIGN KEY (`assigned_agent_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conversations_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_conversations_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversations_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_request_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `actor_user_id` int(10) unsigned DEFAULT NULL,
  `actor_name` varchar(190) DEFAULT NULL,
  `event_type` varchar(50) NOT NULL,
  `note` text DEFAULT NULL,
  `old_status` varchar(50) DEFAULT NULL,
  `new_status` varchar(50) DEFAULT NULL,
  `metadata_json` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_customer_request_events_request` (`request_id`,`created_at`),
  KEY `idx_customer_request_events_actor` (`actor_user_id`),
  KEY `idx_customer_request_events_type` (`event_type`),
  CONSTRAINT `fk_customer_request_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_customer_request_events_request` FOREIGN KEY (`request_id`) REFERENCES `customer_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tracking_code` varchar(32) NOT NULL,
  `full_name` varchar(190) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `normalized_phone` varchar(20) NOT NULL,
  `business_name` varchar(190) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `website_url` varchar(500) DEFAULT NULL,
  `request_type` varchar(50) NOT NULL,
  `business_field` varchar(120) DEFAULT NULL,
  `sites_count` smallint(5) unsigned DEFAULT NULL,
  `agents_count` smallint(5) unsigned DEFAULT NULL,
  `monthly_conversations` varchar(50) DEFAULT NULL,
  `desired_plan_id` int(10) unsigned DEFAULT NULL,
  `desired_plan_name_snapshot` varchar(100) DEFAULT NULL,
  `website_technology` varchar(100) DEFAULT NULL,
  `preferred_contact` enum('phone','whatsapp') NOT NULL DEFAULT 'phone',
  `preferred_contact_time` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `consent_contact` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('new','reviewing','contacted','waiting_customer','qualified','converted','closed','rejected') NOT NULL DEFAULT 'new',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `internal_summary` text DEFAULT NULL,
  `follow_up_at` datetime DEFAULT NULL,
  `last_contacted_at` datetime DEFAULT NULL,
  `converted_tenant_id` int(10) unsigned DEFAULT NULL,
  `converted_at` datetime DEFAULT NULL,
  `source_page` varchar(500) DEFAULT NULL,
  `source_campaign` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `duplicate_fingerprint` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_requests_tracking` (`tracking_code`),
  KEY `idx_customer_requests_status_created` (`status`,`created_at`),
  KEY `idx_customer_requests_phone` (`normalized_phone`),
  KEY `idx_customer_requests_type` (`request_type`),
  KEY `idx_customer_requests_priority` (`priority`),
  KEY `idx_customer_requests_plan` (`desired_plan_id`),
  KEY `idx_customer_requests_follow_up` (`follow_up_at`),
  KEY `idx_customer_requests_converted_tenant` (`converted_tenant_id`),
  KEY `idx_customer_requests_duplicate` (`duplicate_fingerprint`,`created_at`),
  CONSTRAINT `fk_customer_requests_converted_tenant` FOREIGN KEY (`converted_tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_customer_requests_plan` FOREIGN KEY (`desired_plan_id`) REFERENCES `plans` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `department_members` (
  `department_id` int(10) unsigned NOT NULL,
  `user_id` int(10) unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `max_active_conversations` int(10) unsigned NOT NULL DEFAULT 5,
  `routing_weight` int(10) unsigned NOT NULL DEFAULT 1,
  `last_assigned_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`department_id`,`user_id`),
  KEY `idx_department_members_user` (`user_id`,`is_active`),
  KEY `idx_department_members_routing` (`department_id`,`is_active`,`last_assigned_at`),
  CONSTRAINT `fk_department_members_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_department_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `departments` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(140) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `color` char(7) NOT NULL DEFAULT '#2563eb',
  `routing_strategy` enum('manual','round_robin','least_busy') NOT NULL DEFAULT 'round_robin',
  `queue_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `queue_message` varchar(500) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_departments_site_slug` (`site_id`,`slug`),
  KEY `idx_departments_tenant_site_active` (`tenant_id`,`site_id`,`is_active`),
  KEY `idx_departments_default` (`site_id`,`is_default`,`is_active`),
  KEY `fk_departments_created_by` (`created_by`),
  CONSTRAINT `fk_departments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_departments_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_departments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `hosted_support_pages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `public_slug` varchar(120) NOT NULL,
  `page_title` varchar(255) NOT NULL,
  `page_subtitle` varchar(255) DEFAULT NULL,
  `page_description` text DEFAULT NULL,
  `primary_color` varchar(20) NOT NULL DEFAULT '#0f766e',
  `contact_phone` varchar(50) DEFAULT NULL,
  `whatsapp_phone` varchar(50) DEFAULT NULL,
  `timezone` varchar(80) NOT NULL DEFAULT 'Asia/Tehran',
  `require_name` tinyint(1) NOT NULL DEFAULT 1,
  `require_phone` tinyint(1) NOT NULL DEFAULT 1,
  `show_business_hours` tinyint(1) NOT NULL DEFAULT 1,
  `show_faq` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hosted_support_site` (`site_id`),
  UNIQUE KEY `uq_hosted_support_slug` (`public_slug`),
  KEY `idx_hosted_support_tenant` (`tenant_id`),
  KEY `idx_hosted_support_active` (`is_active`),
  CONSTRAINT `fk_hosted_support_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hosted_support_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `knowledge_sources` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `type` enum('faq','manual_text','policy','web_page','product','service') DEFAULT 'manual_text',
  `title` varchar(255) DEFAULT NULL,
  `question` text DEFAULT NULL,
  `answer` text DEFAULT NULL,
  `content` text DEFAULT NULL,
  `url` text DEFAULT NULL,
  `status` enum('draft','approved','archived') DEFAULT 'approved',
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_knowledge_site_id` (`site_id`),
  KEY `idx_knowledge_status` (`status`),
  KEY `fk_knowledge_created_by` (`created_by`),
  FULLTEXT KEY `ft_knowledge_content` (`title`,`question`,`answer`,`content`),
  CONSTRAINT `fk_knowledge_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_knowledge_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `message_attachments` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int(10) unsigned NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_url` varchar(500) NOT NULL,
  `mime_type` varchar(120) NOT NULL,
  `file_size` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_message_attachments_message_id` (`message_id`),
  KEY `idx_message_attachments_mime_created` (`mime_type`,`created_at`),
  KEY `idx_message_attachments_message_created` (`message_id`,`created_at`),
  CONSTRAINT `fk_message_attachments_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `message_mentions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int(10) unsigned NOT NULL,
  `mentioned_user_id` int(10) unsigned NOT NULL,
  `created_by_user_id` int(10) unsigned NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_message_mentioned_user` (`message_id`,`mentioned_user_id`),
  KEY `idx_message_mentions_user_id` (`mentioned_user_id`),
  KEY `idx_message_mentions_unread` (`mentioned_user_id`,`read_at`),
  KEY `fk_message_mentions_creator` (`created_by_user_id`),
  CONSTRAINT `fk_message_mentions_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_message_mentions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_message_mentions_user` FOREIGN KEY (`mentioned_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `message_reactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int(10) unsigned NOT NULL,
  `actor_type` enum('visitor','agent') NOT NULL,
  `actor_id` int(10) unsigned NOT NULL,
  `emoji` varchar(16) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_message_reaction_actor_emoji` (`message_id`,`actor_type`,`actor_id`,`emoji`),
  KEY `idx_message_reactions_message_id` (`message_id`),
  CONSTRAINT `fk_message_reactions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `message_revisions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int(10) unsigned NOT NULL,
  `editor_type` enum('visitor','agent','system') NOT NULL,
  `editor_id` int(10) unsigned DEFAULT NULL,
  `action` enum('edit','delete') NOT NULL,
  `previous_content` text DEFAULT NULL,
  `new_content` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_message_revisions_message_id` (`message_id`),
  KEY `idx_message_revisions_created_at` (`created_at`),
  CONSTRAINT `fk_message_revisions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `messages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(10) unsigned NOT NULL,
  `sender_type` enum('visitor','agent','ai','system') NOT NULL,
  `message_type` enum('text','file','voice','system','internal_note') NOT NULL DEFAULT 'text',
  `sender_id` int(10) unsigned DEFAULT NULL,
  `reply_to_message_id` int(10) unsigned DEFAULT NULL,
  `content` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `delivered_at` datetime DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `edited_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by_type` enum('visitor','agent','system') DEFAULT NULL,
  `deleted_by_id` int(10) unsigned DEFAULT NULL,
  `interaction_updated_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_messages_conversation_id` (`conversation_id`),
  KEY `idx_messages_created_at` (`created_at`),
  KEY `idx_messages_reply_to` (`reply_to_message_id`),
  KEY `idx_messages_deleted_at` (`deleted_at`),
  KEY `idx_messages_interaction_updated_at` (`interaction_updated_at`),
  KEY `idx_messages_delivery_status` (`conversation_id`,`sender_type`,`delivered_at`,`read_at`),
  KEY `idx_messages_read_at` (`read_at`),
  KEY `idx_messages_conversation_type_created` (`conversation_id`,`message_type`,`created_at`),
  KEY `idx_messages_sender_read` (`conversation_id`,`sender_type`,`read_at`),
  CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_reply_to` FOREIGN KEY (`reply_to_message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plans` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `max_sites` int(10) unsigned DEFAULT 1,
  `max_agents` int(10) unsigned DEFAULT 1,
  `max_monthly_conversations` int(10) unsigned DEFAULT 500,
  `ai_suggestions_enabled` tinyint(1) DEFAULT 1,
  `ai_auto_reply_enabled` tinyint(1) DEFAULT 0,
  `knowledge_base_enabled` tinyint(1) DEFAULT 1,
  `price_monthly` decimal(12,2) DEFAULT 0.00,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_browser_fixtures` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `run_id` bigint(20) unsigned NOT NULL,
  `tenant_id` int(10) unsigned DEFAULT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `customer_user_id` int(10) unsigned DEFAULT NULL,
  `department_id` int(10) unsigned DEFAULT NULL,
  `admin_session_id` bigint(20) unsigned DEFAULT NULL,
  `customer_session_id` bigint(20) unsigned DEFAULT NULL,
  `status` enum('creating','ready','cleanup_pending','cleaned','cleanup_failed') NOT NULL DEFAULT 'creating',
  `cleanup_error` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `cleaned_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qa_browser_fixture_run` (`run_id`),
  KEY `idx_qa_browser_fixture_status` (`status`,`created_at`),
  CONSTRAINT `fk_qa_browser_fixture_run` FOREIGN KEY (`run_id`) REFERENCES `qa_test_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_findings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `fingerprint` char(64) NOT NULL,
  `case_key` varchar(150) NOT NULL,
  `category` varchar(80) NOT NULL,
  `title` varchar(255) NOT NULL,
  `target_type` enum('system','tenant','site') NOT NULL DEFAULT 'system',
  `target_id` int(10) unsigned DEFAULT NULL,
  `target_ref` varchar(80) NOT NULL,
  `target_label` varchar(255) DEFAULT NULL,
  `status` enum('open','resolved','ignored') NOT NULL DEFAULT 'open',
  `test_status` enum('warning','failed','error') NOT NULL,
  `severity` enum('info','low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `message` text DEFAULT NULL,
  `root_cause` text DEFAULT NULL,
  `impact` text DEFAULT NULL,
  `expected_value` text DEFAULT NULL,
  `actual_value` text DEFAULT NULL,
  `remediation` text DEFAULT NULL,
  `evidence_json` longtext DEFAULT NULL,
  `risk_score` decimal(4,1) DEFAULT NULL,
  `confidence` enum('low','medium','high','confirmed') DEFAULT NULL,
  `owasp_category` varchar(100) DEFAULT NULL,
  `cwe_id` varchar(40) DEFAULT NULL,
  `affected_component` varchar(190) DEFAULT NULL,
  `verification_mode` enum('static','runtime','database','configuration','hybrid') DEFAULT NULL,
  `first_seen_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL,
  `occurrence_count` int(10) unsigned NOT NULL DEFAULT 1,
  `last_run_id` bigint(20) unsigned NOT NULL,
  `resolved_by` int(10) unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolution_note` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qa_findings_fingerprint` (`fingerprint`),
  KEY `idx_qa_findings_status_severity` (`status`,`severity`,`last_seen_at`),
  KEY `idx_qa_findings_target` (`target_type`,`target_id`,`status`),
  KEY `idx_qa_findings_case` (`case_key`,`status`),
  KEY `idx_qa_findings_last_run` (`last_run_id`),
  KEY `fk_qa_findings_resolved_by` (`resolved_by`),
  KEY `idx_qa_findings_risk` (`status`,`risk_score`,`last_seen_at`),
  KEY `idx_qa_findings_owasp` (`owasp_category`,`cwe_id`,`status`),
  CONSTRAINT `fk_qa_findings_last_run` FOREIGN KEY (`last_run_id`) REFERENCES `qa_test_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_qa_findings_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_test_artifacts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `run_id` bigint(20) unsigned NOT NULL,
  `run_item_id` bigint(20) unsigned DEFAULT NULL,
  `artifact_type` enum('screenshot','trace','console','network','video','html','json','log') NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `storage_path` varchar(1000) NOT NULL,
  `mime_type` varchar(150) DEFAULT NULL,
  `size_bytes` bigint(20) unsigned NOT NULL DEFAULT 0,
  `sha256` char(64) DEFAULT NULL,
  `metadata_json` longtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_qa_artifacts_run` (`run_id`,`artifact_type`,`created_at`),
  KEY `idx_qa_artifacts_item` (`run_item_id`),
  CONSTRAINT `fk_qa_artifacts_item` FOREIGN KEY (`run_item_id`) REFERENCES `qa_test_run_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_qa_artifacts_run` FOREIGN KEY (`run_id`) REFERENCES `qa_test_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_test_run_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `run_id` bigint(20) unsigned NOT NULL,
  `case_key` varchar(150) NOT NULL,
  `category` varchar(80) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `status` enum('passed','warning','failed','skipped','error') NOT NULL,
  `severity` enum('info','low','medium','high','critical') NOT NULL DEFAULT 'info',
  `duration_ms` int(10) unsigned NOT NULL DEFAULT 0,
  `message` text DEFAULT NULL,
  `root_cause` text DEFAULT NULL,
  `impact` text DEFAULT NULL,
  `expected_value` text DEFAULT NULL,
  `actual_value` text DEFAULT NULL,
  `remediation` text DEFAULT NULL,
  `details_json` longtext DEFAULT NULL,
  `evidence_json` longtext DEFAULT NULL,
  `risk_score` decimal(4,1) DEFAULT NULL,
  `confidence` enum('low','medium','high','confirmed') DEFAULT NULL,
  `owasp_category` varchar(100) DEFAULT NULL,
  `cwe_id` varchar(40) DEFAULT NULL,
  `affected_component` varchar(190) DEFAULT NULL,
  `verification_mode` enum('static','runtime','database','configuration','hybrid') DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qa_test_run_case` (`run_id`,`case_key`),
  KEY `idx_qa_test_items_status` (`run_id`,`status`,`severity`),
  KEY `idx_qa_test_items_case` (`case_key`,`created_at`),
  KEY `idx_qa_test_items_security` (`run_id`,`risk_score`,`confidence`),
  KEY `idx_qa_test_items_owasp` (`owasp_category`,`cwe_id`),
  CONSTRAINT `fk_qa_test_items_run` FOREIGN KEY (`run_id`) REFERENCES `qa_test_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_test_runs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `run_key` char(32) NOT NULL,
  `profile` enum('quick','full','security','security_deep','operational','browser') NOT NULL DEFAULT 'quick',
  `target_type` enum('system','tenant','site') NOT NULL DEFAULT 'system',
  `target_id` int(10) unsigned DEFAULT NULL,
  `target_label` varchar(255) DEFAULT NULL,
  `status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  `total_count` int(10) unsigned NOT NULL DEFAULT 0,
  `passed_count` int(10) unsigned NOT NULL DEFAULT 0,
  `warning_count` int(10) unsigned NOT NULL DEFAULT 0,
  `failed_count` int(10) unsigned NOT NULL DEFAULT 0,
  `skipped_count` int(10) unsigned NOT NULL DEFAULT 0,
  `score_percent` decimal(5,2) DEFAULT NULL,
  `duration_ms` int(10) unsigned DEFAULT NULL,
  `progress_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `current_case_key` varchar(150) DEFAULT NULL,
  `heartbeat_at` datetime DEFAULT NULL,
  `cancel_requested_at` datetime DEFAULT NULL,
  `worker_token_hash` char(64) DEFAULT NULL,
  `worker_token_encrypted` text DEFAULT NULL,
  `worker_token_expires_at` datetime DEFAULT NULL,
  `environment` varchar(50) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `triggered_by` int(10) unsigned NOT NULL,
  `triggered_by_name` varchar(190) DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `metadata_json` longtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qa_test_runs_key` (`run_key`),
  KEY `idx_qa_test_runs_status_created` (`status`,`created_at`),
  KEY `idx_qa_test_runs_profile_created` (`profile`,`created_at`),
  KEY `idx_qa_test_runs_target` (`target_type`,`target_id`,`created_at`),
  KEY `idx_qa_test_runs_actor` (`triggered_by`,`created_at`),
  KEY `idx_qa_test_runs_browser_queue` (`profile`,`status`,`created_at`),
  KEY `idx_qa_test_runs_heartbeat` (`status`,`heartbeat_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_test_scratch` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `probe_key` char(32) NOT NULL,
  `payload` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qa_test_scratch_probe` (`probe_key`),
  KEY `idx_qa_test_scratch_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `quick_replies` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_quick_replies_site_id` (`site_id`),
  KEY `idx_quick_replies_active` (`is_active`),
  KEY `fk_quick_replies_created_by` (`created_by`),
  CONSTRAINT `fk_quick_replies_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_quick_replies_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_business_hours` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `day_of_week` tinyint(3) unsigned NOT NULL COMMENT 'ISO-8601: Monday=1 ... Sunday=7',
  `is_open` tinyint(1) NOT NULL DEFAULT 1,
  `open_time` time DEFAULT '09:00:00',
  `close_time` time DEFAULT '18:00:00',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_site_business_day` (`site_id`,`day_of_week`),
  KEY `idx_business_hours_site` (`site_id`),
  CONSTRAINT `fk_business_hours_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_offline_settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `offline_behavior` enum('accept_messages','ai_only','closed') NOT NULL DEFAULT 'accept_messages',
  `offline_message` text DEFAULT NULL,
  `ai_after_hours_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `show_next_opening` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_site_offline_settings` (`site_id`),
  CONSTRAINT `fk_offline_settings_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_schedule_exceptions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `exception_date` date NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `is_closed` tinyint(1) NOT NULL DEFAULT 1,
  `open_time` time DEFAULT NULL,
  `close_time` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_site_schedule_exception` (`site_id`,`exception_date`),
  KEY `idx_schedule_exception_date` (`exception_date`),
  CONSTRAINT `fk_schedule_exception_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sites` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `domain` varchar(255) NOT NULL,
  `site_key` varchar(120) NOT NULL,
  `brand_name` varchar(255) DEFAULT NULL,
  `brand_color` varchar(20) DEFAULT '#2563eb',
  `logo_url` text DEFAULT NULL,
  `welcome_message` text DEFAULT NULL,
  `ai_mode` enum('off','assistant','semi_auto') DEFAULT 'assistant',
  `department_selection_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `default_department_id` int(10) unsigned DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_key` (`site_key`),
  KEY `fk_sites_tenant` (`tenant_id`),
  KEY `idx_sites_default_department` (`default_department_id`),
  CONSTRAINT `fk_sites_default_department` FOREIGN KEY (`default_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sites_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `subscription_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'IRR',
  `payment_method` varchar(50) NOT NULL DEFAULT 'manual',
  `reference_number` varchar(190) DEFAULT NULL,
  `status` enum('pending','paid','failed','refunded','cancelled') NOT NULL DEFAULT 'paid',
  `paid_at` datetime DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_reference` (`reference_number`),
  KEY `idx_payment_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_payment_subscription` (`subscription_id`),
  KEY `idx_payment_status_paid` (`status`,`paid_at`),
  KEY `idx_payment_created_by` (`created_by`),
  CONSTRAINT `fk_payment_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payment_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payment_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_payment_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_error_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `fingerprint` char(64) NOT NULL,
  `level` enum('warning','error','critical') NOT NULL DEFAULT 'error',
  `source` varchar(100) NOT NULL DEFAULT 'php',
  `message` text NOT NULL,
  `exception_class` varchar(190) DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `line_number` int(10) unsigned DEFAULT NULL,
  `request_method` varchar(10) DEFAULT NULL,
  `request_uri` varchar(1000) DEFAULT NULL,
  `status_code` smallint(5) unsigned DEFAULT NULL,
  `context_json` longtext DEFAULT NULL,
  `occurrences` int(10) unsigned NOT NULL DEFAULT 1,
  `first_seen_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_system_error_logs_fingerprint` (`fingerprint`),
  KEY `idx_system_error_logs_resolution` (`resolved_at`,`last_seen_at`),
  KEY `idx_system_error_logs_level` (`level`,`last_seen_at`),
  KEY `idx_system_error_logs_status` (`status_code`,`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_request_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_method` varchar(10) NOT NULL,
  `request_uri` varchar(1000) NOT NULL,
  `status_code` smallint(5) unsigned NOT NULL,
  `duration_ms` decimal(12,2) NOT NULL,
  `peak_memory_bytes` bigint(20) unsigned NOT NULL DEFAULT 0,
  `ip_hash` char(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `occurred_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_system_request_logs_duration` (`duration_ms`,`occurred_at`),
  KEY `idx_system_request_logs_status` (`status_code`,`occurred_at`),
  KEY `idx_system_request_logs_occurred` (`occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_service_heartbeats` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `service_key` varchar(100) NOT NULL,
  `service_label` varchar(190) NOT NULL,
  `status` enum('healthy','degraded','down','idle') NOT NULL DEFAULT 'healthy',
  `message` varchar(500) DEFAULT NULL,
  `metadata_json` longtext DEFAULT NULL,
  `last_seen_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_system_service_heartbeats_key` (`service_key`),
  KEY `idx_system_service_heartbeats_seen` (`last_seen_at`),
  KEY `idx_system_service_heartbeats_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` longtext DEFAULT NULL,
  `value_type` enum('string','boolean','integer','json','datetime') NOT NULL DEFAULT 'string',
  `updated_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_system_settings_key` (`setting_key`),
  KEY `idx_system_settings_updated_by` (`updated_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_notes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `author_user_id` int(10) unsigned NOT NULL,
  `body` text NOT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tenant_notes_tenant` (`tenant_id`,`is_pinned`,`created_at`),
  KEY `idx_tenant_notes_author` (`author_user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_onboarding_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `item_key` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `status` enum('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `due_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_onboarding_item` (`tenant_id`,`item_key`),
  KEY `idx_tenant_onboarding_status` (`tenant_id`,`status`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_subscriptions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `plan_id` int(10) unsigned NOT NULL,
  `status` enum('trial','active','past_due','expired','cancelled','suspended') NOT NULL DEFAULT 'active',
  `billing_cycle` enum('monthly','quarterly','yearly','manual') NOT NULL DEFAULT 'manual',
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `trial_ends_at` datetime DEFAULT NULL,
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0,
  `price` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency` char(3) NOT NULL DEFAULT 'IRR',
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_subscription_tenant_status_end` (`tenant_id`,`status`,`ends_at`),
  KEY `idx_subscription_plan` (`plan_id`),
  KEY `idx_subscription_end` (`ends_at`),
  KEY `idx_subscription_created_by` (`created_by`),
  CONSTRAINT `fk_subscription_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_subscription_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`),
  CONSTRAINT `fk_subscription_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_subscription_dates` CHECK (`ends_at` > `starts_at`),
  CONSTRAINT `chk_subscription_price` CHECK (`price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_tag_assignments` (
  `tenant_id` int(10) unsigned NOT NULL,
  `tag_id` int(10) unsigned NOT NULL,
  `assigned_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`tenant_id`,`tag_id`),
  KEY `idx_tenant_tag_assignments_tag` (`tag_id`,`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_tags` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `slug` varchar(140) NOT NULL,
  `color` varchar(20) NOT NULL DEFAULT '#64748b',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_tags_slug` (`slug`),
  KEY `idx_tenant_tags_active` (`is_active`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenants` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `owner_email` varchar(255) DEFAULT NULL,
  `owner_phone` varchar(50) DEFAULT NULL,
  `plan_id` int(10) unsigned DEFAULT NULL,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `lifecycle_stage` enum('onboarding','active','at_risk','paused','churned') NOT NULL DEFAULT 'onboarding',
  `suspension_reason` varchar(1000) DEFAULT NULL,
  `account_manager_id` int(10) unsigned DEFAULT NULL,
  `onboarding_completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_tenants_plan` (`plan_id`),
  KEY `idx_tenants_lifecycle` (`lifecycle_stage`,`status`),
  KEY `idx_tenants_account_manager` (`account_manager_id`,`status`),
  CONSTRAINT `fk_tenants_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_notification_preferences` (
  `user_id` int(10) unsigned NOT NULL,
  `sound_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `browser_notifications_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `title_badge_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_notification_preferences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('super_admin','customer_admin','agent') NOT NULL,
  `admin_role_id` int(10) unsigned DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `token_version` int(10) unsigned NOT NULL DEFAULT 1,
  `failed_login_attempts` smallint(5) unsigned NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `two_factor_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `two_factor_secret_encrypted` text DEFAULT NULL,
  `two_factor_confirmed_at` datetime DEFAULT NULL,
  `ip_allowlist_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `last_login_ip` varchar(45) DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT NULL,
  `availability_status` enum('online','offline') NOT NULL DEFAULT 'online',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_tenant` (`tenant_id`),
  KEY `idx_users_admin_role` (`admin_role_id`,`is_active`),
  KEY `idx_users_locked_until` (`locked_until`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visitor_operator_invites` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `visitor_id` int(10) unsigned NOT NULL,
  `session_id` bigint(20) unsigned DEFAULT NULL,
  `conversation_id` int(10) unsigned NOT NULL,
  `department_id` int(10) unsigned DEFAULT NULL,
  `operator_id` int(10) unsigned NOT NULL,
  `message_id` int(10) unsigned DEFAULT NULL,
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
  KEY `fk_operator_invites_tenant` (`tenant_id`),
  KEY `fk_operator_invites_site` (`site_id`),
  KEY `fk_operator_invites_session` (`session_id`),
  KEY `fk_operator_invites_department` (`department_id`),
  KEY `fk_operator_invites_message` (`message_id`),
  CONSTRAINT `fk_operator_invites_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_session` FOREIGN KEY (`session_id`) REFERENCES `visitor_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_operator_invites_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visitor_page_views` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `session_id` bigint(20) unsigned NOT NULL,
  `site_id` int(10) unsigned NOT NULL,
  `visitor_id` int(10) unsigned NOT NULL,
  `page_url` varchar(1000) NOT NULL,
  `page_title` varchar(255) DEFAULT NULL,
  `referrer_url` varchar(1000) DEFAULT NULL,
  `entered_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `duration_seconds` int(10) unsigned NOT NULL DEFAULT 0,
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visitor_sessions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `visitor_id` int(10) unsigned NOT NULL,
  `session_key` varchar(120) NOT NULL,
  `first_page_url` varchar(1000) DEFAULT NULL,
  `last_page_url` varchar(1000) DEFAULT NULL,
  `last_page_title` varchar(255) DEFAULT NULL,
  `referrer_url` varchar(1000) DEFAULT NULL,
  `device_type` enum('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  `browser_name` varchar(80) DEFAULT NULL,
  `operating_system` varchar(80) DEFAULT NULL,
  `page_view_count` int(10) unsigned NOT NULL DEFAULT 0,
  `total_active_seconds` int(10) unsigned NOT NULL DEFAULT 0,
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visitors` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `browser_id` varchar(120) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `first_seen_at` datetime DEFAULT NULL,
  `last_seen_at` datetime DEFAULT NULL,
  `current_page_url` varchar(1000) DEFAULT NULL,
  `current_page_title` varchar(255) DEFAULT NULL,
  `referrer_url` varchar(1000) DEFAULT NULL,
  `device_type` enum('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  `browser_name` varchar(80) DEFAULT NULL,
  `operating_system` varchar(80) DEFAULT NULL,
  `session_count` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_visitors_site_id` (`site_id`),
  KEY `idx_visitors_browser_id` (`browser_id`),
  KEY `idx_visitors_last_seen_at` (`last_seen_at`),
  KEY `idx_visitors_site_presence` (`site_id`,`last_seen_at`,`device_type`),
  KEY `idx_visitors_site_current_page` (`site_id`,`current_page_title`),
  CONSTRAINT `fk_visitors_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
-- Automation Center v1: rules, SLA tracking, alerts, tags and execution history.
-- Additive migration; existing conversations and routing data are preserved.

CREATE TABLE `automation_rules` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `name` varchar(190) NOT NULL,
  `description` text DEFAULT NULL,
  `trigger_type` varchar(50) NOT NULL,
  `match_type` enum('all','any') NOT NULL DEFAULT 'all',
  `conditions_json` longtext NOT NULL,
  `actions_json` longtext NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `priority` smallint(5) unsigned NOT NULL DEFAULT 100,
  `cooldown_seconds` int(10) unsigned NOT NULL DEFAULT 0,
  `stop_processing` tinyint(1) NOT NULL DEFAULT 0,
  `last_run_at` datetime DEFAULT NULL,
  `run_count` int(10) unsigned NOT NULL DEFAULT 0,
  `success_count` int(10) unsigned NOT NULL DEFAULT 0,
  `failure_count` int(10) unsigned NOT NULL DEFAULT 0,
  `created_by` int(10) unsigned DEFAULT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_automation_rules_scope` (`tenant_id`,`site_id`,`is_active`,`trigger_type`,`priority`),
  KEY `fk_automation_rules_created_by` (`created_by`),
  KEY `fk_automation_rules_updated_by` (`updated_by`),
  CONSTRAINT `fk_automation_rules_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_automation_rules_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_automation_rules_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_rules_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `automation_sla_policies` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `name` varchar(190) NOT NULL,
  `first_response_minutes` int(10) unsigned NOT NULL DEFAULT 15,
  `resolution_minutes` int(10) unsigned NOT NULL DEFAULT 1440,
  `warning_before_minutes` int(10) unsigned NOT NULL DEFAULT 5,
  `breach_priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'urgent',
  `breach_department_id` int(10) unsigned DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) unsigned DEFAULT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_automation_sla_scope` (`tenant_id`,`site_id`,`is_active`,`is_default`),
  KEY `fk_automation_sla_department` (`breach_department_id`),
  KEY `fk_automation_sla_created_by` (`created_by`),
  KEY `fk_automation_sla_updated_by` (`updated_by`),
  CONSTRAINT `fk_automation_sla_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_automation_sla_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_automation_sla_department` FOREIGN KEY (`breach_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_sla_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_sla_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `conversation_sla_status` (
  `conversation_id` int(10) unsigned NOT NULL,
  `policy_id` int(10) unsigned NOT NULL,
  `state` enum('tracking','warning','breached','met','resolved') NOT NULL DEFAULT 'tracking',
  `first_response_due_at` datetime NOT NULL,
  `resolution_due_at` datetime NOT NULL,
  `first_response_at` datetime DEFAULT NULL,
  `warning_sent_at` datetime DEFAULT NULL,
  `first_response_breached_at` datetime DEFAULT NULL,
  `resolution_breached_at` datetime DEFAULT NULL,
  `last_checked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`conversation_id`),
  KEY `idx_conversation_sla_due` (`state`,`first_response_due_at`,`resolution_due_at`),
  KEY `idx_conversation_sla_policy` (`policy_id`),
  CONSTRAINT `fk_conversation_sla_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversation_sla_policy` FOREIGN KEY (`policy_id`) REFERENCES `automation_sla_policies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `automation_execution_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `rule_id` int(10) unsigned DEFAULT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `conversation_id` int(10) unsigned DEFAULT NULL,
  `rule_name` varchar(190) NOT NULL,
  `trigger_type` varchar(50) NOT NULL,
  `event_key` varchar(190) DEFAULT NULL,
  `status` enum('success','failed','skipped') NOT NULL,
  `duration_ms` int(10) unsigned NOT NULL DEFAULT 0,
  `condition_context_json` longtext DEFAULT NULL,
  `action_results_json` longtext DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_automation_rule_event` (`rule_id`,`event_key`),
  KEY `idx_automation_logs_tenant` (`tenant_id`,`created_at`),
  KEY `idx_automation_logs_conversation` (`conversation_id`,`created_at`),
  KEY `idx_automation_logs_status` (`tenant_id`,`status`,`created_at`),
  CONSTRAINT `fk_automation_logs_rule` FOREIGN KEY (`rule_id`) REFERENCES `automation_rules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_logs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_automation_logs_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_logs_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `automation_alerts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `rule_id` int(10) unsigned DEFAULT NULL,
  `conversation_id` int(10) unsigned DEFAULT NULL,
  `recipient_user_id` int(10) unsigned DEFAULT NULL,
  `severity` enum('info','warning','high','critical') NOT NULL DEFAULT 'warning',
  `title` varchar(190) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_automation_alerts_inbox` (`tenant_id`,`recipient_user_id`,`is_read`,`created_at`),
  KEY `idx_automation_alerts_conversation` (`conversation_id`,`created_at`),
  CONSTRAINT `fk_automation_alerts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_automation_alerts_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_alerts_rule` FOREIGN KEY (`rule_id`) REFERENCES `automation_rules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_alerts_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_automation_alerts_recipient` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `conversation_tags` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `site_id` int(10) unsigned DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `color` varchar(20) NOT NULL DEFAULT '#64748b',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conversation_tags_scope_name` (`tenant_id`,`site_id`,`name`),
  KEY `idx_conversation_tags_tenant` (`tenant_id`,`name`),
  CONSTRAINT `fk_conversation_tags_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversation_tags_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `conversation_tag_assignments` (
  `conversation_id` int(10) unsigned NOT NULL,
  `tag_id` int(10) unsigned NOT NULL,
  `assigned_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`conversation_id`,`tag_id`),
  KEY `idx_conversation_tag_assignments_tag` (`tag_id`,`created_at`),
  KEY `fk_conversation_tag_assignments_actor` (`assigned_by`),
  CONSTRAINT `fk_conversation_tag_assignments_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversation_tag_assignments_tag` FOREIGN KEY (`tag_id`) REFERENCES `conversation_tags` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversation_tag_assignments_actor` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `widget_events` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `site_id` int(10) unsigned NOT NULL,
  `visitor_id` int(10) unsigned DEFAULT NULL,
  `event_type` enum('widget_opened','widget_closed','conversation_started','lead_submitted') NOT NULL,
  `page_url` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_widget_events_site_id` (`site_id`),
  KEY `idx_widget_events_type` (`event_type`),
  KEY `fk_widget_events_visitor` (`visitor_id`),
  CONSTRAINT `fk_widget_events_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_widget_events_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
