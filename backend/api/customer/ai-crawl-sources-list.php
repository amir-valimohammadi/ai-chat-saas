<?php

// مسیر فایل: backend/api/customer/ai-crawl-sources-list.php
// هدف: دریافت منابع داخلی خزش و وضعیت دانش وابسته به هر منبع

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/ai-helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;

try {
    $site = ai_get_customer_site($pdo, $user, $siteId);

    $stmt = $pdo->prepare("
        SELECT
            cs.id,
            cs.tenant_id,
            cs.site_id,
            cs.source_type,
            cs.source_value,
            cs.label,
            cs.category_hint,
            cs.is_active,
            cs.created_by,
            cs.last_crawled_at,
            cs.created_at,
            cs.updated_at,
            COUNT(DISTINCT p.id) AS pages_count,
            COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) AS active_chunks_count,
            COUNT(DISTINCT CASE WHEN q.status = 'active' THEN q.id END) AS active_questions_count
        FROM ai_crawl_sources cs
        LEFT JOIN ai_pages p ON p.source_id = cs.id
        LEFT JOIN ai_content_chunks c ON c.page_id = p.id
        LEFT JOIN ai_generated_questions q ON q.page_id = p.id
        WHERE cs.site_id = :site_id
          AND cs.tenant_id = :tenant_id
        GROUP BY cs.id
        ORDER BY cs.is_active DESC, cs.id DESC
    ");
    $stmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $user['tenant_id'],
    ]);
    $items = $stmt->fetchAll();

    json_response([
        'success' => true,
        'site' => [
            'id' => (int) $site['id'],
            'name' => $site['name'],
            'domain' => $site['domain'],
            'scope_base_url' => ai_site_scope_base_url((string) $site['domain']),
        ],
        'items' => array_map(function ($item) use ($site) {
            // منابع قدیمی را بدون متوقف‌کردن کل فهرست بررسی می‌کنیم.
            // اگر قبلاً آدرس خارجی ذخیره شده باشد، در رابط با وضعیت نامعتبر
            // نمایش داده می‌شود تا کاربر آن را غیرفعال یا اصلاح کند.
            $rawSourceValue = trim((string) $item['source_value']);
            $sourceValue = null;
            $sourceType = (string) $item['source_type'];
            $allowedTypes = ['url', 'path_prefix', 'sitemap'];

            if (preg_match('/^https?:\/\//i', $rawSourceValue)) {
                $sourceValue = ai_internal_path_for_url($rawSourceValue, (string) $site['domain']);
            } else {
                $sourceValue = ai_normalize_internal_path(str_replace('*', '', $rawSourceValue));
            }

            $resolvedUrl = $sourceValue !== null
                ? ai_site_url_from_internal_path((string) $site['domain'], $sourceValue)
                : null;
            $isScopeValid = in_array($sourceType, $allowedTypes, true)
                && $sourceValue !== null
                && $resolvedUrl !== null;

            return [
                'id' => (int) $item['id'],
                'tenant_id' => (int) $item['tenant_id'],
                'site_id' => (int) $item['site_id'],
                'source_type' => $sourceType,
                'source_value' => $isScopeValid ? $sourceValue : $rawSourceValue,
                'resolved_url' => $isScopeValid ? $resolvedUrl : null,
                'is_scope_valid' => $isScopeValid,
                'label' => $item['label'],
                'category_hint' => $item['category_hint'],
                'is_active' => (bool) $item['is_active'],
                'created_by' => $item['created_by'] !== null ? (int) $item['created_by'] : null,
                'last_crawled_at' => $item['last_crawled_at'],
                'created_at' => $item['created_at'],
                'updated_at' => $item['updated_at'],
                'pages_count' => (int) $item['pages_count'],
                'active_chunks_count' => (int) $item['active_chunks_count'],
                'active_questions_count' => (int) $item['active_questions_count'],
            ];
        }, $items),
    ]);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'دریافت منابع خزش ناموفق بود.',
        ...safe_api_exception_context($e),
    ], 500);
}
