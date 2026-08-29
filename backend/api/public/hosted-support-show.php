<?php

// مسیر فایل: backend/api/public/hosted-support-show.php
// هدف: دریافت اطلاعات عمومی صفحه پشتیبانی اختصاصی بدون نیاز به ورود

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/rate-limit.php';
require_once __DIR__ . '/../../includes/hosted-support.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$slug = hosted_support_normalize_slug((string) ($_GET['slug'] ?? ''));

if (!hosted_support_slug_is_valid($slug)) {
    json_response([
        'success' => false,
        'message' => 'صفحه پشتیبانی پیدا نشد.',
    ], 404);
}

enforce_rate_limit(
    $pdo,
    'hosted_support_show',
    rate_limit_identifier($slug . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    120,
    60,
    'Too many requests. Please slow down.'
);

try {
    $stmt = $pdo->prepare('
        SELECT
            hosted_support_pages.*,
            sites.name AS site_name,
            sites.site_key,
            sites.brand_name,
            sites.brand_color,
            sites.logo_url,
            sites.welcome_message,
            sites.ai_mode,
            sites.is_active AS site_is_active,
            tenants.status AS tenant_status
        FROM hosted_support_pages
        INNER JOIN sites ON sites.id = hosted_support_pages.site_id
        INNER JOIN tenants ON tenants.id = hosted_support_pages.tenant_id
        WHERE hosted_support_pages.public_slug = :slug
        LIMIT 1
    ');
    $stmt->execute([':slug' => $slug]);
    $page = $stmt->fetch();

    if (
        !$page
        || (int) $page['is_active'] !== 1
        || (int) $page['site_is_active'] !== 1
        || $page['tenant_status'] !== 'active'
    ) {
        json_response([
            'success' => false,
            'message' => 'صفحه پشتیبانی در دسترس نیست.',
        ], 404);
    }

    $siteId = (int) $page['site_id'];
    $status = hosted_support_compute_status(
        $pdo,
        $siteId,
        $page['timezone'] ?: 'Asia/Tehran'
    );

    $hours = (int) $page['show_business_hours'] === 1
        ? hosted_support_get_hours($pdo, $siteId)
        : [];

    $faqs = [];
    if ((int) $page['show_faq'] === 1) {
        $faqStmt = $pdo->prepare('
            SELECT id, title, question, answer, content
            FROM knowledge_sources
            WHERE site_id = :site_id
              AND type = \'faq\'
              AND status = \'approved\'
            ORDER BY updated_at DESC, id DESC
            LIMIT 6
        ');
        $faqStmt->execute([':site_id' => $siteId]);

        $faqs = array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'question' => $row['question'] ?: ($row['title'] ?: 'سؤال متداول'),
                'answer' => $row['answer'] ?: ($row['content'] ?: ''),
            ];
        }, $faqStmt->fetchAll());
    }

    json_response([
        'success' => true,
        'page' => [
            'slug' => $page['public_slug'],
            'public_url' => hosted_support_public_url($page['public_slug']),
            'title' => $page['page_title'],
            'subtitle' => $page['page_subtitle'],
            'description' => $page['page_description'],
            'primary_color' => $page['primary_color'] ?: ($page['brand_color'] ?: '#0f766e'),
            'contact_phone' => $page['contact_phone'],
            'whatsapp_phone' => $page['whatsapp_phone'],
            'timezone' => $page['timezone'],
            'require_name' => (bool) $page['require_name'],
            'require_phone' => (bool) $page['require_phone'],
            'show_business_hours' => (bool) $page['show_business_hours'],
            'show_faq' => (bool) $page['show_faq'],
        ],
        'site' => [
            'name' => $page['site_name'],
            'site_key' => $page['site_key'],
            'brand_name' => $page['brand_name'] ?: $page['site_name'],
            'brand_color' => $page['brand_color'],
            'logo_url' => $page['logo_url'],
            'welcome_message' => $page['welcome_message'] ?: 'سلام، چطور می‌توانیم راهنمایی‌تان کنیم؟',
            'ai_mode' => $page['ai_mode'],
        ],
        'status' => $status,
        'business_hours' => $hours,
        'faqs' => $faqs,
    ]);
} catch (Throwable $e) {
    error_log('[HOSTED_SUPPORT_SHOW] ' . $e->getMessage());

    $payload = [
        'success' => false,
        'message' => 'دریافت صفحه پشتیبانی ممکن نیست.',
    ];

    if (!app_is_production()) {
        safe_api_exception_context($e);
    }

    json_response($payload, 500);
}
