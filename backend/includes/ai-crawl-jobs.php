<?php

// مسیر فایل: backend/includes/ai-crawl-jobs.php
// هدف: مدیریت صف، پیشرفت و چرخه عمر خزش مرحله‌ای

require_once __DIR__ . '/ai-crawler.php';
require_once __DIR__ . '/ai-helpers.php';

if (!function_exists('ai_crawl_terminal_statuses')) {
    function ai_crawl_terminal_statuses(): array
    {
        return ['completed', 'failed', 'ignored', 'skipped'];
    }
}

if (!function_exists('ai_crawl_run_to_array')) {
    function ai_crawl_run_to_array(array $run): array
    {
        return [
            'id' => (int) $run['id'],
            'tenant_id' => (int) $run['tenant_id'],
            'site_id' => (int) $run['site_id'],
            'status' => $run['status'],
            'current_stage' => $run['current_stage'] ?? 'queued',
            'current_message' => $run['current_message'] ?? null,
            'current_url' => $run['current_url'] ?? null,
            'progress_percent' => (int) ($run['progress_percent'] ?? 0),
            'page_limit' => (int) ($run['page_limit'] ?? 0),
            'max_depth' => (int) ($run['max_depth'] ?? 0),
            'total_urls' => (int) ($run['total_urls'] ?? 0),
            'queued_urls' => (int) ($run['queued_urls'] ?? 0),
            'processed_urls' => (int) ($run['processed_urls'] ?? 0),
            'fetched_pages' => (int) ($run['fetched_pages'] ?? 0),
            'failed_pages' => (int) ($run['failed_pages'] ?? 0),
            'created_chunks' => (int) ($run['created_chunks'] ?? 0),
            'created_terms' => (int) ($run['created_terms'] ?? 0),
            'created_questions' => (int) ($run['created_questions'] ?? 0),
            'unchanged_pages' => (int) ($run['unchanged_pages'] ?? 0),
            'preserved_questions' => (int) ($run['preserved_questions'] ?? 0),
            'archived_questions' => (int) ($run['archived_questions'] ?? 0),
            'error_message' => $run['error_message'] ?? null,
            'started_at' => $run['started_at'] ?? null,
            'finished_at' => $run['finished_at'] ?? null,
            'last_activity_at' => $run['last_activity_at'] ?? null,
            'created_at' => $run['created_at'] ?? null,
            'updated_at' => $run['updated_at'] ?? null,
        ];
    }
}

if (!function_exists('ai_crawl_get_run')) {
    function ai_crawl_get_run(PDO $pdo, int $tenantId, int $runId): ?array
    {
        $stmt = $pdo->prepare("
            SELECT *
            FROM ai_crawl_runs
            WHERE id = :id
              AND tenant_id = :tenant_id
            LIMIT 1
        ");
        $stmt->execute([
            ':id' => $runId,
            ':tenant_id' => $tenantId,
        ]);

        $run = $stmt->fetch();

        return $run ?: null;
    }
}

if (!function_exists('ai_crawl_get_active_run')) {
    function ai_crawl_get_active_run(PDO $pdo, int $tenantId, int $siteId): ?array
    {
        $stmt = $pdo->prepare("
            SELECT *
            FROM ai_crawl_runs
            WHERE tenant_id = :tenant_id
              AND site_id = :site_id
              AND status IN ('queued', 'running')
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute([
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
        ]);

        $run = $stmt->fetch();

        return $run ?: null;
    }
}

if (!function_exists('ai_crawl_update_stage')) {
    function ai_crawl_update_stage(
        PDO $pdo,
        int $tenantId,
        int $runId,
        string $stage,
        string $message,
        ?string $currentUrl = null,
        ?int $minimumProgress = null
    ): void {
        $sql = "
            UPDATE ai_crawl_runs
            SET
                current_stage = :stage,
                current_message = :message,
                current_url = :current_url,
                status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
                started_at = COALESCE(started_at, NOW()),
                last_activity_at = NOW()
        ";

        $params = [
            ':stage' => $stage,
            ':message' => mb_substr($message, 0, 500),
            ':current_url' => $currentUrl !== null ? mb_substr($currentUrl, 0, 1000) : null,
            ':id' => $runId,
            ':tenant_id' => $tenantId,
        ];

        if ($minimumProgress !== null) {
            $sql .= ", progress_percent = GREATEST(progress_percent, :minimum_progress)";
            $params[':minimum_progress'] = max(0, min(99, $minimumProgress));
        }

        $sql .= " WHERE id = :id AND tenant_id = :tenant_id";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    }
}

if (!function_exists('ai_crawl_enqueue_item')) {
    function ai_crawl_enqueue_item(
        PDO $pdo,
        array $run,
        ?int $sourceId,
        string $itemType,
        string $url,
        int $depth = 0,
        ?string $pathPrefix = null,
        ?string $discoveredFromUrl = null
    ): bool {
        if (!in_array($itemType, ['page', 'sitemap'], true)) {
            return false;
        }

        $url = ai_clean_url($url);

        if (!ai_url_belongs_to_site_scope($url, (string) $run['site_domain'])) {
            return false;
        }

        if ($itemType === 'sitemap') {
            $sitemapCountStmt = $pdo->prepare("
                SELECT COUNT(*)
                FROM ai_crawl_queue
                WHERE crawl_run_id = :run_id
                  AND item_type = 'sitemap'
            ");
            $sitemapCountStmt->execute([':run_id' => $run['id']]);

            if ((int) $sitemapCountStmt->fetchColumn() >= 20) {
                return false;
            }
        }

        if ($itemType === 'page') {
            $countStmt = $pdo->prepare("
                SELECT COUNT(*)
                FROM ai_crawl_queue
                WHERE crawl_run_id = :run_id
                  AND item_type = 'page'
            ");
            $countStmt->execute([':run_id' => $run['id']]);

            if ((int) $countStmt->fetchColumn() >= (int) $run['page_limit']) {
                return false;
            }
        }

        $stmt = $pdo->prepare("
            INSERT IGNORE INTO ai_crawl_queue (
                crawl_run_id,
                tenant_id,
                site_id,
                source_id,
                item_type,
                url,
                url_hash,
                depth,
                path_prefix,
                discovered_from_url,
                status
            ) VALUES (
                :crawl_run_id,
                :tenant_id,
                :site_id,
                :source_id,
                :item_type,
                :url,
                :url_hash,
                :depth,
                :path_prefix,
                :discovered_from_url,
                'queued'
            )
        ");

        $stmt->execute([
            ':crawl_run_id' => $run['id'],
            ':tenant_id' => $run['tenant_id'],
            ':site_id' => $run['site_id'],
            ':source_id' => $sourceId,
            ':item_type' => $itemType,
            ':url' => $url,
            ':url_hash' => hash('sha256', $url),
            ':depth' => max(0, min(10, $depth)),
            ':path_prefix' => $pathPrefix,
            ':discovered_from_url' => $discoveredFromUrl,
        ]);

        return $stmt->rowCount() > 0;
    }
}

if (!function_exists('ai_crawl_recalculate_progress')) {
    function ai_crawl_recalculate_progress(PDO $pdo, int $tenantId, int $runId): array
    {
        $countsStmt = $pdo->prepare("
            SELECT
                SUM(CASE WHEN item_type = 'page' THEN 1 ELSE 0 END) AS total_pages,
                SUM(CASE WHEN item_type = 'page' AND status = 'queued' THEN 1 ELSE 0 END) AS queued_pages,
                SUM(CASE WHEN item_type = 'page' AND status IN ('completed','failed','ignored','skipped') THEN 1 ELSE 0 END) AS processed_pages,
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS all_queued,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS all_processing
            FROM ai_crawl_queue
            WHERE crawl_run_id = :run_id
              AND tenant_id = :tenant_id
        ");
        $countsStmt->execute([
            ':run_id' => $runId,
            ':tenant_id' => $tenantId,
        ]);
        $counts = $countsStmt->fetch() ?: [];

        $run = ai_crawl_get_run($pdo, $tenantId, $runId);

        if (!$run) {
            throw new RuntimeException('Crawl run not found');
        }

        $totalPages = (int) ($counts['total_pages'] ?? 0);
        $queuedPages = (int) ($counts['queued_pages'] ?? 0);
        $processedPages = (int) ($counts['processed_pages'] ?? 0);
        $allQueued = (int) ($counts['all_queued'] ?? 0);
        $allProcessing = (int) ($counts['all_processing'] ?? 0);

        $ratio = $totalPages > 0 ? $processedPages / $totalPages : 0.0;
        $calculatedProgress = 10 + (int) floor(min(1, $ratio) * 85);
        $progress = max((int) ($run['progress_percent'] ?? 0), min(95, $calculatedProgress));

        if ($run['status'] === 'completed') {
            $progress = 100;
        }

        $updateStmt = $pdo->prepare("
            UPDATE ai_crawl_runs
            SET
                total_urls = :total_urls,
                queued_urls = :queued_urls,
                processed_urls = :processed_urls,
                progress_percent = :progress_percent,
                last_activity_at = NOW()
            WHERE id = :id
              AND tenant_id = :tenant_id
        ");
        $updateStmt->execute([
            ':total_urls' => $totalPages,
            ':queued_urls' => $queuedPages,
            ':processed_urls' => $processedPages,
            ':progress_percent' => $progress,
            ':id' => $runId,
            ':tenant_id' => $tenantId,
        ]);

        $run = ai_crawl_get_run($pdo, $tenantId, $runId);
        $run['_queue'] = [
            'all_queued' => $allQueued,
            'all_processing' => $allProcessing,
        ];

        return $run;
    }
}

if (!function_exists('ai_crawl_finalize_run')) {
    function ai_crawl_finalize_run(PDO $pdo, int $tenantId, int $runId): array
    {
        ai_crawl_update_stage(
            $pdo,
            $tenantId,
            $runId,
            'finalizing',
            'در حال نهایی‌سازی دانش استخراج‌شده و ثبت نتیجه خزش…',
            null,
            97
        );

        $sourceStmt = $pdo->prepare("
            UPDATE ai_crawl_sources
            SET last_crawled_at = NOW()
            WHERE tenant_id = :tenant_id
              AND id IN (
                  SELECT source_id
                  FROM ai_crawl_queue
                  WHERE crawl_run_id = :run_id
                    AND source_id IS NOT NULL
              )
        ");
        $sourceStmt->execute([
            ':tenant_id' => $tenantId,
            ':run_id' => $runId,
        ]);

        $finishStmt = $pdo->prepare("
            UPDATE ai_crawl_runs
            SET
                status = 'completed',
                current_stage = 'completed',
                current_message = 'خزش با موفقیت کامل شد.',
                current_url = NULL,
                progress_percent = 100,
                finished_at = NOW(),
                last_activity_at = NOW()
            WHERE id = :id
              AND tenant_id = :tenant_id
        ");
        $finishStmt->execute([
            ':id' => $runId,
            ':tenant_id' => $tenantId,
        ]);

        return ai_crawl_get_run($pdo, $tenantId, $runId) ?: [];
    }
}

if (!function_exists('ai_crawl_maybe_finalize')) {
    function ai_crawl_maybe_finalize(PDO $pdo, int $tenantId, int $runId): array
    {
        $run = ai_crawl_recalculate_progress($pdo, $tenantId, $runId);
        $queue = $run['_queue'] ?? ['all_queued' => 0, 'all_processing' => 0];
        unset($run['_queue']);

        if ((int) $queue['all_queued'] === 0 && (int) $queue['all_processing'] === 0) {
            return ai_crawl_finalize_run($pdo, $tenantId, $runId);
        }

        return $run;
    }
}

if (!function_exists('ai_set_crawl_source_status')) {
    function ai_set_crawl_source_status(PDO $pdo, array $user, int $sourceId, bool $isActive): array
    {
        $sourceStmt = $pdo->prepare("
            SELECT cs.*, s.domain
            FROM ai_crawl_sources cs
            INNER JOIN sites s ON s.id = cs.site_id
            WHERE cs.id = :id
              AND cs.tenant_id = :tenant_id
            LIMIT 1
        ");
        $sourceStmt->execute([
            ':id' => $sourceId,
            ':tenant_id' => $user['tenant_id'],
        ]);
        $source = $sourceStmt->fetch();

        if (!$source) {
            throw new RuntimeException('Crawl source not found');
        }

        $pdo->beginTransaction();

        try {
            $preservedQuestions = 0;
            $archivedQuestions = 0;
            $archivedChunks = 0;
            $affectedPages = 0;

            if (!$isActive) {
                // سؤال‌های ویرایش‌شده به دانش مستقل تبدیل می‌شوند و از حذف یا آرشیو منبع آسیب نمی‌بینند.
                $preserveStmt = $pdo->prepare("
                    UPDATE ai_generated_questions q
                    INNER JOIN ai_pages p ON p.id = q.page_id
                    SET
                        q.page_id = NULL,
                        q.chunk_id = NULL,
                        q.source_type = 'manual',
                        q.source_chunk_hash = NULL,
                        q.is_user_edited = 1,
                        q.preserved_at = COALESCE(q.preserved_at, NOW()),
                        q.status = 'active'
                    WHERE p.source_id = :source_id
                      AND q.tenant_id = :tenant_id
                      AND (q.is_user_edited = 1 OR q.source_type IN ('edited', 'manual'))
                ");
                $preserveStmt->execute([
                    ':source_id' => $sourceId,
                    ':tenant_id' => $user['tenant_id'],
                ]);
                $preservedQuestions = $preserveStmt->rowCount();

                $archiveQuestionsStmt = $pdo->prepare("
                    UPDATE ai_generated_questions q
                    INNER JOIN ai_pages p ON p.id = q.page_id
                    SET q.status = 'archived'
                    WHERE p.source_id = :source_id
                      AND q.tenant_id = :tenant_id
                      AND q.status <> 'archived'
                ");
                $archiveQuestionsStmt->execute([
                    ':source_id' => $sourceId,
                    ':tenant_id' => $user['tenant_id'],
                ]);
                $archivedQuestions = $archiveQuestionsStmt->rowCount();

                $archiveChunksStmt = $pdo->prepare("
                    UPDATE ai_content_chunks c
                    INNER JOIN ai_pages p ON p.id = c.page_id
                    SET c.status = 'archived'
                    WHERE p.source_id = :source_id
                      AND c.tenant_id = :tenant_id
                      AND c.status <> 'archived'
                ");
                $archiveChunksStmt->execute([
                    ':source_id' => $sourceId,
                    ':tenant_id' => $user['tenant_id'],
                ]);
                $archivedChunks = $archiveChunksStmt->rowCount();

                $pagesStmt = $pdo->prepare("
                    UPDATE ai_pages
                    SET crawl_status = 'ignored'
                    WHERE source_id = :source_id
                      AND tenant_id = :tenant_id
                ");
                $pagesStmt->execute([
                    ':source_id' => $sourceId,
                    ':tenant_id' => $user['tenant_id'],
                ]);
                $affectedPages = $pagesStmt->rowCount();

                $skipQueueStmt = $pdo->prepare("
                    UPDATE ai_crawl_queue q
                    INNER JOIN ai_crawl_runs r ON r.id = q.crawl_run_id
                    SET
                        q.status = 'skipped',
                        q.error_message = 'Source disabled during crawl',
                        q.processed_at = NOW()
                    WHERE q.source_id = :source_id
                      AND q.tenant_id = :tenant_id
                      AND q.status = 'queued'
                      AND r.status IN ('queued', 'running')
                ");
                $skipQueueStmt->execute([
                    ':source_id' => $sourceId,
                    ':tenant_id' => $user['tenant_id'],
                ]);
            }

            $updateStmt = $pdo->prepare("
                UPDATE ai_crawl_sources
                SET is_active = :is_active
                WHERE id = :id
                  AND tenant_id = :tenant_id
            ");
            $updateStmt->execute([
                ':is_active' => $isActive ? 1 : 0,
                ':id' => $sourceId,
                ':tenant_id' => $user['tenant_id'],
            ]);

            $pdo->commit();

            return [
                'source_id' => $sourceId,
                'is_active' => $isActive,
                'requires_recrawl' => $isActive,
                'preserved_questions' => $preservedQuestions,
                'archived_questions' => $archivedQuestions,
                'archived_chunks' => $archivedChunks,
                'affected_pages' => $affectedPages,
            ];
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            throw $e;
        }
    }
}
