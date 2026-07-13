-- AI Knowledge System Migration
-- Path: backend/database/migrations/2026_07_07_ai_knowledge_tables.sql

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `ai_site_settings` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `assistant_enabled` tinyint(1) NOT NULL DEFAULT 1,
    `auto_reply_enabled` tinyint(1) NOT NULL DEFAULT 0,
    `crawl_enabled` tinyint(1) NOT NULL DEFAULT 1,

    `min_auto_reply_score` decimal(5,2) NOT NULL DEFAULT 75.00,
    `min_suggestion_score` decimal(5,2) NOT NULL DEFAULT 45.00,

    `max_pages_per_crawl` int(10) UNSIGNED NOT NULL DEFAULT 30,
    `max_depth` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,

    `fallback_message` text DEFAULT NULL,

    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_ai_site_settings_site` (`site_id`),
    KEY `idx_ai_site_settings_tenant` (`tenant_id`),

    CONSTRAINT `fk_ai_site_settings_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_site_settings_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_crawl_sources` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `source_type` enum('url','path_prefix','sitemap') NOT NULL DEFAULT 'url',
    `source_value` varchar(1000) NOT NULL,

    `label` varchar(255) DEFAULT NULL,
    `category_hint` varchar(120) DEFAULT NULL,

    `is_active` tinyint(1) NOT NULL DEFAULT 1,
    `created_by` int(10) UNSIGNED DEFAULT NULL,

    `last_crawled_at` timestamp NULL DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),

    PRIMARY KEY (`id`),
    KEY `idx_ai_crawl_sources_site` (`site_id`,`is_active`),
    KEY `idx_ai_crawl_sources_tenant` (`tenant_id`),
    KEY `fk_ai_crawl_sources_created_by` (`created_by`),

    CONSTRAINT `fk_ai_crawl_sources_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_crawl_sources_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_crawl_sources_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_crawl_runs` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `started_by` int(10) UNSIGNED DEFAULT NULL,

    `status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',

    `total_urls` int(10) UNSIGNED NOT NULL DEFAULT 0,
    `fetched_pages` int(10) UNSIGNED NOT NULL DEFAULT 0,
    `failed_pages` int(10) UNSIGNED NOT NULL DEFAULT 0,
    `created_chunks` int(10) UNSIGNED NOT NULL DEFAULT 0,
    `created_terms` int(10) UNSIGNED NOT NULL DEFAULT 0,
    `created_questions` int(10) UNSIGNED NOT NULL DEFAULT 0,

    `error_message` text DEFAULT NULL,

    `started_at` timestamp NULL DEFAULT NULL,
    `finished_at` timestamp NULL DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),

    PRIMARY KEY (`id`),
    KEY `idx_ai_crawl_runs_site_status` (`site_id`,`status`),
    KEY `idx_ai_crawl_runs_tenant` (`tenant_id`),
    KEY `fk_ai_crawl_runs_started_by` (`started_by`),

    CONSTRAINT `fk_ai_crawl_runs_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_crawl_runs_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_crawl_runs_started_by`
    FOREIGN KEY (`started_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_pages` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `crawl_run_id` int(10) UNSIGNED DEFAULT NULL,
    `source_id` int(10) UNSIGNED DEFAULT NULL,

    `url` varchar(1000) NOT NULL,
    `url_hash` char(64) NOT NULL,

    `title` varchar(500) DEFAULT NULL,
    `meta_description` text DEFAULT NULL,

    `main_heading` varchar(500) DEFAULT NULL,
    `clean_text` mediumtext DEFAULT NULL,

    `content_hash` char(64) DEFAULT NULL,

    `category` varchar(120) DEFAULT NULL,
    `detected_intent` varchar(120) DEFAULT NULL,

    `status_code` smallint(5) UNSIGNED DEFAULT NULL,
    `crawl_status` enum('pending','success','failed','ignored') NOT NULL DEFAULT 'pending',

    `word_count` int(10) UNSIGNED NOT NULL DEFAULT 0,

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

    CONSTRAINT `fk_ai_pages_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_pages_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_pages_crawl_run`
    FOREIGN KEY (`crawl_run_id`) REFERENCES `ai_crawl_runs` (`id`) ON DELETE SET NULL,

    CONSTRAINT `fk_ai_pages_source`
    FOREIGN KEY (`source_id`) REFERENCES `ai_crawl_sources` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_content_chunks` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,
    `page_id` int(10) UNSIGNED NOT NULL,

    `chunk_index` int(10) UNSIGNED NOT NULL DEFAULT 0,

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

    CONSTRAINT `fk_ai_chunks_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_chunks_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_chunks_page`
    FOREIGN KEY (`page_id`) REFERENCES `ai_pages` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_terms` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `page_id` int(10) UNSIGNED DEFAULT NULL,
    `chunk_id` int(10) UNSIGNED DEFAULT NULL,

    `term` varchar(255) NOT NULL,
    `normalized_term` varchar(255) NOT NULL,

    `term_type` enum('word','phrase','category','intent') NOT NULL DEFAULT 'word',

    `category` varchar(120) DEFAULT NULL,
    `detected_intent` varchar(120) DEFAULT NULL,

    `frequency` int(10) UNSIGNED NOT NULL DEFAULT 1,
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

    CONSTRAINT `fk_ai_terms_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_terms_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_terms_page`
    FOREIGN KEY (`page_id`) REFERENCES `ai_pages` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_terms_chunk`
    FOREIGN KEY (`chunk_id`) REFERENCES `ai_content_chunks` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_generated_questions` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `page_id` int(10) UNSIGNED DEFAULT NULL,
    `chunk_id` int(10) UNSIGNED DEFAULT NULL,

    `question` text NOT NULL,
    `normalized_question` text DEFAULT NULL,

    `answer_text` text DEFAULT NULL,

    `category` varchar(120) DEFAULT NULL,
    `detected_intent` varchar(120) DEFAULT NULL,

    `source_type` enum('template','heading','faq','manual') NOT NULL DEFAULT 'template',

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

    FULLTEXT KEY `ft_ai_questions_search` (`question`,`normalized_question`,`answer_text`),

    CONSTRAINT `fk_ai_questions_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_questions_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_questions_page`
    FOREIGN KEY (`page_id`) REFERENCES `ai_pages` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_questions_chunk`
    FOREIGN KEY (`chunk_id`) REFERENCES `ai_content_chunks` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_unanswered_questions` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `conversation_id` int(10) UNSIGNED DEFAULT NULL,
    `message_id` int(10) UNSIGNED DEFAULT NULL,

    `question` text NOT NULL,
    `normalized_question` text DEFAULT NULL,

    `detected_category` varchar(120) DEFAULT NULL,
    `detected_intent` varchar(120) DEFAULT NULL,

    `best_match_score` decimal(6,2) NOT NULL DEFAULT 0.00,
    `best_sources_json` longtext DEFAULT NULL,

    `status` enum('new','reviewed','added_to_knowledge','ignored') NOT NULL DEFAULT 'new',

    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),

    PRIMARY KEY (`id`),

    KEY `idx_ai_unanswered_site_status` (`site_id`,`status`),
    KEY `idx_ai_unanswered_conversation` (`conversation_id`),
    KEY `idx_ai_unanswered_message` (`message_id`),
    KEY `idx_ai_unanswered_tenant` (`tenant_id`),

    FULLTEXT KEY `ft_ai_unanswered_search` (`question`,`normalized_question`),

    CONSTRAINT `fk_ai_unanswered_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_unanswered_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_unanswered_conversation`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,

    CONSTRAINT `fk_ai_unanswered_message`
    FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `ai_answer_logs` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` int(10) UNSIGNED NOT NULL,
    `site_id` int(10) UNSIGNED NOT NULL,

    `conversation_id` int(10) UNSIGNED DEFAULT NULL,
    `message_id` int(10) UNSIGNED DEFAULT NULL,

    `user_question` text NOT NULL,
    `normalized_question` text DEFAULT NULL,

    `reply_text` text DEFAULT NULL,

    `confidence_score` decimal(6,2) NOT NULL DEFAULT 0.00,

    `matched_chunk_id` int(10) UNSIGNED DEFAULT NULL,
    `matched_question_id` int(10) UNSIGNED DEFAULT NULL,

    `sources_json` longtext DEFAULT NULL,

    `reply_mode` enum('suggestion','auto_reply','fallback','no_answer') NOT NULL DEFAULT 'suggestion',

    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),

    PRIMARY KEY (`id`),

    KEY `idx_ai_answer_logs_site` (`site_id`),
    KEY `idx_ai_answer_logs_conversation` (`conversation_id`),
    KEY `idx_ai_answer_logs_message` (`message_id`),
    KEY `idx_ai_answer_logs_confidence` (`confidence_score`),
    KEY `idx_ai_answer_logs_tenant` (`tenant_id`),
    KEY `idx_ai_answer_logs_chunk` (`matched_chunk_id`),
    KEY `idx_ai_answer_logs_question` (`matched_question_id`),

    CONSTRAINT `fk_ai_answer_logs_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_answer_logs_site`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,

    CONSTRAINT `fk_ai_answer_logs_conversation`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,

    CONSTRAINT `fk_ai_answer_logs_message`
    FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,

    CONSTRAINT `fk_ai_answer_logs_chunk`
    FOREIGN KEY (`matched_chunk_id`) REFERENCES `ai_content_chunks` (`id`) ON DELETE SET NULL,

    CONSTRAINT `fk_ai_answer_logs_question`
    FOREIGN KEY (`matched_question_id`) REFERENCES `ai_generated_questions` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS = 1;