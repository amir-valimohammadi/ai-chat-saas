<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/ai-settings.php
// هدف: دریافت و ویرایش تنظیمات AI برای سایت مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;
        $site = ai_get_customer_site($pdo, $user, $siteId);

        $stmt = $pdo->prepare(" 
            SELECT
                id,
                tenant_id,
                site_id,
                assistant_enabled,
                auto_reply_enabled,
                crawl_enabled,
                min_auto_reply_score,
                min_suggestion_score,
                max_pages_per_crawl,
                max_depth,
                fallback_message,
                created_at,
                updated_at
            FROM ai_site_settings
            WHERE site_id = :site_id
              AND tenant_id = :tenant_id
            LIMIT 1
        ");

        $stmt->execute([
            ':site_id' => $siteId,
            ':tenant_id' => $user['tenant_id'],
        ]);

        $settings = $stmt->fetch();

        if (!$settings) {
            $settings = [
                'id' => null,
                'tenant_id' => $user['tenant_id'],
                'site_id' => $siteId,
                'assistant_enabled' => 1,
                'auto_reply_enabled' => 0,
                'crawl_enabled' => 1,
                'min_auto_reply_score' => '75.00',
                'min_suggestion_score' => '45.00',
                'max_pages_per_crawl' => 30,
                'max_depth' => 1,
                'fallback_message' => 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد تا در اولین فرصت پاسخ بدهند.',
                'created_at' => null,
                'updated_at' => null,
            ];
        }

        json_response([
            'success' => true,
            'site' => [
                'id' => (int) $site['id'],
                'name' => $site['name'],
                'domain' => $site['domain'],
            ],
            'settings' => [
                'id' => $settings['id'] !== null ? (int) $settings['id'] : null,
                'tenant_id' => (int) $settings['tenant_id'],
                'site_id' => (int) $settings['site_id'],
                'assistant_enabled' => (bool) $settings['assistant_enabled'],
                'auto_reply_enabled' => (bool) $settings['auto_reply_enabled'],
                'crawl_enabled' => (bool) $settings['crawl_enabled'],
                'min_auto_reply_score' => (float) $settings['min_auto_reply_score'],
                'min_suggestion_score' => (float) $settings['min_suggestion_score'],
                'max_pages_per_crawl' => (int) $settings['max_pages_per_crawl'],
                'max_depth' => (int) $settings['max_depth'],
                'fallback_message' => $settings['fallback_message'],
                'created_at' => $settings['created_at'],
                'updated_at' => $settings['updated_at'],
            ]
        ]);
    }

    $input = get_json_input();
    $siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;
    $site = ai_get_customer_site($pdo, $user, $siteId);

    $assistantEnabled = array_key_exists('assistant_enabled', $input) ? ai_bool($input['assistant_enabled']) : 1;
    $autoReplyEnabled = array_key_exists('auto_reply_enabled', $input) ? ai_bool($input['auto_reply_enabled']) : 0;
    $crawlEnabled = array_key_exists('crawl_enabled', $input) ? ai_bool($input['crawl_enabled']) : 1;

    // ai_mode و کلیدهای AI باید همیشه یک معنی داشته باشند.
    if ($assistantEnabled !== 1) {
        $assistantEnabled = 0;
        $autoReplyEnabled = 0;
        $effectiveAiMode = 'off';
    } elseif ($autoReplyEnabled === 1) {
        $effectiveAiMode = 'semi_auto';
    } else {
        $effectiveAiMode = 'assistant';
    }

    if ($autoReplyEnabled === 1) {
        $plan = get_tenant_plan_limits($pdo, (int) $user['tenant_id']);

        if (!$plan['ai_auto_reply_enabled']) {
            json_response([
                'success' => false,
                'code' => 'PLAN_FEATURE_UNAVAILABLE',
                'message' => 'قابلیت پاسخ خودکار در پلن فعلی فعال نیست. ابتدا آن را از پنل سوپر ادمین برای پلن مشتری فعال کنید.',
                'feature' => 'ai_auto_reply_enabled',
                'plan' => [
                    'id' => $plan['plan_id'],
                    'name' => $plan['plan_name'],
                ],
            ], 403);
        }
    }

    $minAutoReplyScore = ai_score($input['min_auto_reply_score'] ?? null, 75.00, 0.00, 100.00);
    $minSuggestionScore = ai_score($input['min_suggestion_score'] ?? null, 45.00, 0.00, 100.00);

    $maxPagesPerCrawl = isset($input['max_pages_per_crawl']) ? (int) $input['max_pages_per_crawl'] : 30;
    $maxDepth = isset($input['max_depth']) ? (int) $input['max_depth'] : 1;

    if ($maxPagesPerCrawl < 1) {
        $maxPagesPerCrawl = 1;
    }

    if ($maxPagesPerCrawl > 100) {
        $maxPagesPerCrawl = 100;
    }

    if ($maxDepth < 0) {
        $maxDepth = 0;
    }

    if ($maxDepth > 3) {
        $maxDepth = 3;
    }

    $fallbackMessage = trim((string) ($input['fallback_message'] ?? ''));

    if ($fallbackMessage === '') {
        $fallbackMessage = 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد تا در اولین فرصت پاسخ بدهند.';
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare(" 
        INSERT INTO ai_site_settings (
            tenant_id,
            site_id,
            assistant_enabled,
            auto_reply_enabled,
            crawl_enabled,
            min_auto_reply_score,
            min_suggestion_score,
            max_pages_per_crawl,
            max_depth,
            fallback_message
        ) VALUES (
            :tenant_id,
            :site_id,
            :assistant_enabled,
            :auto_reply_enabled,
            :crawl_enabled,
            :min_auto_reply_score,
            :min_suggestion_score,
            :max_pages_per_crawl,
            :max_depth,
            :fallback_message
        )
        ON DUPLICATE KEY UPDATE
            assistant_enabled = VALUES(assistant_enabled),
            auto_reply_enabled = VALUES(auto_reply_enabled),
            crawl_enabled = VALUES(crawl_enabled),
            min_auto_reply_score = VALUES(min_auto_reply_score),
            min_suggestion_score = VALUES(min_suggestion_score),
            max_pages_per_crawl = VALUES(max_pages_per_crawl),
            max_depth = VALUES(max_depth),
            fallback_message = VALUES(fallback_message)
    ");

    $stmt->execute([
        ':tenant_id' => $user['tenant_id'],
        ':site_id' => $site['id'],
        ':assistant_enabled' => $assistantEnabled,
        ':auto_reply_enabled' => $autoReplyEnabled,
        ':crawl_enabled' => $crawlEnabled,
        ':min_auto_reply_score' => $minAutoReplyScore,
        ':min_suggestion_score' => $minSuggestionScore,
        ':max_pages_per_crawl' => $maxPagesPerCrawl,
        ':max_depth' => $maxDepth,
        ':fallback_message' => $fallbackMessage,
    ]);

    $siteModeStmt = $pdo->prepare("
        UPDATE sites
        SET ai_mode = :ai_mode
        WHERE id = :site_id
          AND tenant_id = :tenant_id
    ");
    $siteModeStmt->execute([
        ':ai_mode' => $effectiveAiMode,
        ':site_id' => (int) $site['id'],
        ':tenant_id' => (int) $user['tenant_id'],
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'تنظیمات AI با موفقیت ذخیره شد.',
        'ai_mode' => $effectiveAiMode,
        'assistant_enabled' => (bool) $assistantEnabled,
        'auto_reply_enabled' => (bool) $autoReplyEnabled,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response([
        'success' => false,
        'message' => 'Failed to save AI settings',
        ...safe_api_exception_context($e)
    ], 500);
}