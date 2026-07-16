<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-crawl-start.php
// هدف: شروع خزش سبک AI برای سایت مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../includes/ai-crawler.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';
require_once __DIR__ . '/../../includes/subscription.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
require_active_subscription($pdo, (int) $user['tenant_id'], 'crawl_start');

$input = get_json_input();
$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);
    require_site_plan_feature(
        $pdo,
        $siteId,
        'knowledge_base_enabled',
        'Knowledge Base'
    );

    $settingsStmt = $pdo->prepare("
        SELECT *
        FROM ai_site_settings
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");

    $settingsStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    $settings = $settingsStmt->fetch();

    if (!$settings) {
        $settings = [
            'crawl_enabled' => 1,
            'max_pages_per_crawl' => 30,
            'max_depth' => 1,
        ];
    }

    if ((int) $settings['crawl_enabled'] !== 1) {
        json_response([
            'success' => false,
            'message' => 'AI crawler is disabled for this site'
        ], 422);
    }

    $maxPages = max(1, min(100, (int) $settings['max_pages_per_crawl']));
    $maxDepth = max(0, min(3, (int) $settings['max_depth']));

    $sourcesStmt = $pdo->prepare("
        SELECT *
        FROM ai_crawl_sources
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
          AND is_active = 1
        ORDER BY id ASC
    ");

    $sourcesStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    $sources = $sourcesStmt->fetchAll();

    if (!$sources) {
        json_response([
            'success' => false,
            'message' => 'No active crawl sources found for this site'
        ], 422);
    }

    $runStmt = $pdo->prepare("
        INSERT INTO ai_crawl_runs (
            tenant_id,
            site_id,
            started_by,
            status,
            started_at
        ) VALUES (
            :tenant_id,
            :site_id,
            :started_by,
            'running',
            NOW()
        )
    ");

    $runStmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $siteId,
        ':started_by' => $user['id'],
    ]);

    $crawlRunId = (int) $pdo->lastInsertId();

    $baseUrl = ai_site_base_url($site['domain']);

    $queue = [];
    $visited = [];
    $results = [];

    foreach ($sources as $source) {
        $sourceType = $source['source_type'];
        $sourceValue = $source['source_value'];

        if ($sourceType === 'url') {
            if (preg_match('/^https?:\/\//i', $sourceValue)) {
                $url = ai_clean_url($sourceValue);
            } else {
                $url = ai_absolute_url($baseUrl, $sourceValue);
            }

            if ($url) {
                $queue[] = [
                    'url' => $url,
                    'depth' => 0,
                    'source' => $source,
                    'prefix' => null
                ];
            }
        }

        if ($sourceType === 'path_prefix') {
            $seedPath = str_replace('*', '', $sourceValue);
            $seedPath = $seedPath === '' ? '/' : $seedPath;

            $url = ai_absolute_url($baseUrl, $seedPath);

            if ($url) {
                $queue[] = [
                    'url' => $url,
                    'depth' => 0,
                    'source' => $source,
                    'prefix' => $sourceValue
                ];
            }
        }

        if ($sourceType === 'sitemap') {
            if (preg_match('/^https?:\/\//i', $sourceValue)) {
                $sitemapUrl = ai_clean_url($sourceValue);
            } else {
                $sitemapUrl = ai_absolute_url($baseUrl, $sourceValue);
            }

            if ($sitemapUrl) {
                $fetch = ai_fetch_url($sitemapUrl);

                if ($fetch['success']) {
                    $urls = ai_extract_sitemap_urls($fetch['body']);

                    foreach ($urls as $url) {
                        if (!ai_host_belongs_to_site($url, $site['domain'])) {
                            continue;
                        }

                        $queue[] = [
                            'url' => $url,
                            'depth' => 0,
                            'source' => $source,
                            'prefix' => null
                        ];
                    }
                }
            }
        }
    }

    $totalUrls = count($queue);
    $fetchedPages = 0;
    $failedPages = 0;
    $createdChunks = 0;
    $createdTerms = 0;
    $createdQuestions = 0;
    $unchangedPages = 0;
    $preservedQuestions = 0;
    $archivedQuestions = 0;

    while ($queue && $fetchedPages < $maxPages) {
        $item = array_shift($queue);

        $url = ai_clean_url($item['url']);
        $urlKey = hash('sha256', $url);

        if (isset($visited[$urlKey])) {
            continue;
        }

        $visited[$urlKey] = true;

        if (!ai_host_belongs_to_site($url, $site['domain'])) {
            continue;
        }

        $fetch = ai_fetch_url($url);

        if (!$fetch['success']) {
            $failedPages++;

            $results[] = [
                'url' => $url,
                'status' => 'failed',
                'status_code' => $fetch['status_code'],
                'error' => $fetch['error']
            ];

            continue;
        }

        $content = ai_extract_html_content($fetch['body']);

        if (mb_strlen($content['clean_text']) < 80) {
            $failedPages++;

            $results[] = [
                'url' => $url,
                'status' => 'ignored',
                'reason' => 'Page content is too short'
            ];

            continue;
        }

        $storeResult = ai_store_page_knowledge(
            $pdo,
            $site,
            $crawlRunId,
            (int) $item['source']['id'],
            $url,
            (int) $fetch['status_code'],
            $content,
            $item['source']['category_hint'] ?? null
        );

        $fetchedPages++;
        $createdChunks += $storeResult['chunks'];
        $createdTerms += $storeResult['terms'];
        $createdQuestions += $storeResult['questions'];
        $unchangedPages += !empty($storeResult['unchanged']) ? 1 : 0;
        $preservedQuestions += (int) ($storeResult['preserved_questions'] ?? 0);
        $archivedQuestions += (int) ($storeResult['archived_questions'] ?? 0);

        $results[] = [
            'url' => $url,
            'status' => 'success',
            'page_id' => $storeResult['page_id'],
            'category' => $storeResult['category'],
            'intent' => $storeResult['intent'],
            'chunks' => $storeResult['chunks'],
            'terms' => $storeResult['terms'],
            'questions' => $storeResult['questions'],
            'unchanged' => (bool) ($storeResult['unchanged'] ?? false),
            'preserved_questions' => (int) ($storeResult['preserved_questions'] ?? 0),
            'archived_questions' => (int) ($storeResult['archived_questions'] ?? 0)
        ];

        if ($item['depth'] < $maxDepth) {
            foreach ($content['links'] as $href) {
                $nextUrl = ai_absolute_url($url, $href);

                if (!$nextUrl) {
                    continue;
                }

                if (!ai_host_belongs_to_site($nextUrl, $site['domain'])) {
                    continue;
                }

                if ($item['prefix'] && !ai_path_matches_prefix($nextUrl, $item['prefix'])) {
                    continue;
                }

                $nextKey = hash('sha256', ai_clean_url($nextUrl));

                if (isset($visited[$nextKey])) {
                    continue;
                }

                if (count($queue) + $fetchedPages >= $maxPages) {
                    break;
                }

                $queue[] = [
                    'url' => $nextUrl,
                    'depth' => $item['depth'] + 1,
                    'source' => $item['source'],
                    'prefix' => $item['prefix']
                ];
            }
        }
    }

    $finishStmt = $pdo->prepare("
        UPDATE ai_crawl_runs
        SET
            status = 'completed',
            total_urls = :total_urls,
            fetched_pages = :fetched_pages,
            failed_pages = :failed_pages,
            created_chunks = :created_chunks,
            created_terms = :created_terms,
            created_questions = :created_questions,
            finished_at = NOW()
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");

    $finishStmt->execute([
        ':total_urls' => $totalUrls,
        ':fetched_pages' => $fetchedPages,
        ':failed_pages' => $failedPages,
        ':created_chunks' => $createdChunks,
        ':created_terms' => $createdTerms,
        ':created_questions' => $createdQuestions,
        ':id' => $crawlRunId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    $updateSourceStmt = $pdo->prepare("
        UPDATE ai_crawl_sources
        SET last_crawled_at = NOW()
        WHERE site_id = :site_id
          AND tenant_id = :tenant_id
          AND is_active = 1
    ");

    $updateSourceStmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);

    json_response([
        'success' => true,
        'message' => 'AI crawl completed successfully',
        'run_id' => $crawlRunId,
        'summary' => [
            'total_urls' => $totalUrls,
            'fetched_pages' => $fetchedPages,
            'failed_pages' => $failedPages,
            'created_chunks' => $createdChunks,
            'created_terms' => $createdTerms,
            'created_questions' => $createdQuestions,
            'unchanged_pages' => $unchangedPages,
            'preserved_questions' => $preservedQuestions,
            'archived_questions' => $archivedQuestions,
        ],
        'results' => $results
    ]);
} catch (Exception $e) {
    if (!empty($crawlRunId)) {
        $failStmt = $pdo->prepare("
            UPDATE ai_crawl_runs
            SET
                status = 'failed',
                error_message = :error_message,
                finished_at = NOW()
            WHERE id = :id
        ");

        $failStmt->execute([
            ':error_message' => $e->getMessage(),
            ':id' => $crawlRunId,
        ]);
    }

    json_response([
        'success' => false,
        'message' => 'AI crawl failed',
        'error' => $e->getMessage()
    ], 500);
}
