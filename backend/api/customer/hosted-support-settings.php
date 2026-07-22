<?php

// مسیر فایل: backend/api/customer/hosted-support-settings.php
// هدف: مدیریت صفحه پشتیبانی اختصاصی، ساعت کاری و رفتار آفلاین توسط Customer Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/hosted-support.php';
require_once __DIR__ . '/../../includes/subscription.php';

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$tenantId = (int) $user['tenant_id'];
require_active_subscription($pdo, $tenantId, 'hosted_support_settings');

function hosted_support_owned_site(PDO $pdo, int $tenantId, int $siteId): array
{
    $stmt = $pdo->prepare('
        SELECT id, tenant_id, name, domain, site_key, brand_name,
               brand_color, logo_url, welcome_message, ai_mode, is_active
        FROM sites
        WHERE id = :site_id
          AND tenant_id = :tenant_id
        LIMIT 1
    ');
    $stmt->execute([
        ':site_id' => $siteId,
        ':tenant_id' => $tenantId,
    ]);
    $site = $stmt->fetch();

    if (!$site) {
        json_response([
            'success' => false,
            'message' => 'سایت موردنظر پیدا نشد.',
        ], 404);
    }

    return $site;
}

function hosted_support_page_payload(PDO $pdo, array $site): array
{
    $siteId = (int) $site['id'];
    hosted_support_ensure_defaults($pdo, $siteId);

    $stmt = $pdo->prepare('
        SELECT *
        FROM hosted_support_pages
        WHERE site_id = :site_id
        LIMIT 1
    ');
    $stmt->execute([':site_id' => $siteId]);
    $page = $stmt->fetch();

    $exceptionStmt = $pdo->prepare('
        SELECT id, exception_date, title, is_closed, open_time, close_time
        FROM site_schedule_exceptions
        WHERE site_id = :site_id
          AND exception_date >= CURDATE()
        ORDER BY exception_date ASC
        LIMIT 30
    ');
    $exceptionStmt->execute([':site_id' => $siteId]);

    $exceptions = array_map(static function (array $row): array {
        return [
            'id' => (int) $row['id'],
            'exception_date' => $row['exception_date'],
            'title' => $row['title'],
            'is_closed' => (bool) $row['is_closed'],
            'open_time' => hosted_support_format_time($row['open_time']),
            'close_time' => hosted_support_format_time($row['close_time']),
        ];
    }, $exceptionStmt->fetchAll());

    return [
        'site' => [
            'id' => $siteId,
            'name' => $site['name'],
            'domain' => $site['domain'],
            'brand_name' => $site['brand_name'],
            'brand_color' => $site['brand_color'],
            'logo_url' => $site['logo_url'],
            'welcome_message' => $site['welcome_message'],
            'is_active' => (bool) $site['is_active'],
        ],
        'page' => $page ? [
            'id' => (int) $page['id'],
            'public_slug' => $page['public_slug'],
            'public_url' => hosted_support_public_url($page['public_slug']),
            'page_title' => $page['page_title'],
            'page_subtitle' => $page['page_subtitle'],
            'page_description' => $page['page_description'],
            'primary_color' => $page['primary_color'],
            'contact_phone' => $page['contact_phone'],
            'whatsapp_phone' => $page['whatsapp_phone'],
            'timezone' => $page['timezone'],
            'require_name' => (bool) $page['require_name'],
            'require_phone' => (bool) $page['require_phone'],
            'show_business_hours' => (bool) $page['show_business_hours'],
            'show_faq' => (bool) $page['show_faq'],
            'is_active' => (bool) $page['is_active'],
        ] : null,
        'business_hours' => hosted_support_get_hours($pdo, $siteId),
        'offline' => hosted_support_get_offline_settings($pdo, $siteId),
        'exceptions' => $exceptions,
        'status' => hosted_support_compute_status(
            $pdo,
            $siteId,
            $page['timezone'] ?? 'Asia/Tehran'
        ),
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $siteId = isset($_GET['site_id']) ? (int) $_GET['site_id'] : 0;

        $sitesStmt = $pdo->prepare('
            SELECT id, tenant_id, name, domain, site_key, brand_name,
                   brand_color, logo_url, welcome_message, ai_mode, is_active
            FROM sites
            WHERE tenant_id = :tenant_id
            ORDER BY id DESC
        ');
        $sitesStmt->execute([':tenant_id' => $tenantId]);
        $sites = $sitesStmt->fetchAll();

        if ($siteId <= 0 && count($sites) > 0) {
            $siteId = (int) $sites[0]['id'];
        }

        $selected = null;
        if ($siteId > 0) {
            $selectedSite = hosted_support_owned_site($pdo, $tenantId, $siteId);
            $selected = hosted_support_page_payload($pdo, $selectedSite);
        }

        $summary = [];
        if (count($sites) > 0) {
            $ids = array_map(static fn(array $site): int => (int) $site['id'], $sites);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $pageStmt = $pdo->prepare("SELECT site_id, public_slug, is_active FROM hosted_support_pages WHERE site_id IN ($placeholders)");
            $pageStmt->execute($ids);

            foreach ($pageStmt->fetchAll() as $row) {
                $summary[(int) $row['site_id']] = [
                    'public_slug' => $row['public_slug'],
                    'public_url' => hosted_support_public_url($row['public_slug']),
                    'is_active' => (bool) $row['is_active'],
                ];
            }
        }

        json_response([
            'success' => true,
            'sites' => array_map(static function (array $site) use ($summary): array {
                $siteId = (int) $site['id'];
                return [
                    'id' => $siteId,
                    'name' => $site['name'],
                    'domain' => $site['domain'],
                    'brand_name' => $site['brand_name'],
                    'brand_color' => $site['brand_color'],
                    'is_active' => (bool) $site['is_active'],
                    'hosted_page' => $summary[$siteId] ?? null,
                ];
            }, $sites),
            'selected' => $selected,
        ]);
    } catch (Throwable $e) {
        $payload = [
            'success' => false,
            'message' => 'دریافت تنظیمات صفحه پشتیبانی ممکن نیست.',
        ];
        if (!app_is_production()) {
            $payload['error'] = $e->getMessage();
        }
        json_response($payload, 500);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$input = get_json_input();
$siteId = (int) ($input['site_id'] ?? 0);
$site = hosted_support_owned_site($pdo, $tenantId, $siteId);

$pageInput = is_array($input['page'] ?? null) ? $input['page'] : [];
$hoursInput = is_array($input['business_hours'] ?? null) ? $input['business_hours'] : [];
$offlineInput = is_array($input['offline'] ?? null) ? $input['offline'] : [];
$exceptionsInput = is_array($input['exceptions'] ?? null) ? $input['exceptions'] : [];

$pageTitle = trim((string) ($pageInput['page_title'] ?? ($site['brand_name'] ?: $site['name'])));
$pageSubtitle = trim((string) ($pageInput['page_subtitle'] ?? 'پشتیبانی و ارتباط مستقیم'));
$pageDescription = trim((string) ($pageInput['page_description'] ?? 'برای دریافت راهنمایی، پیگیری یا مشاوره، گفتگو را آغاز کنید.'));
$slugInput = hosted_support_normalize_slug((string) ($pageInput['public_slug'] ?? ''));
$primaryColor = strtolower(trim((string) ($pageInput['primary_color'] ?? ($site['brand_color'] ?: '#0f766e'))));
$contactPhone = trim((string) ($pageInput['contact_phone'] ?? ''));
$whatsappPhone = trim((string) ($pageInput['whatsapp_phone'] ?? ''));
$timezone = trim((string) ($pageInput['timezone'] ?? 'Asia/Tehran'));

if ($pageTitle === '' || mb_strlen($pageTitle, 'UTF-8') > 255) {
    json_response(['success' => false, 'message' => 'عنوان صفحه معتبر نیست.'], 422);
}

if (mb_strlen($pageSubtitle, 'UTF-8') > 255 || mb_strlen($pageDescription, 'UTF-8') > 2000) {
    json_response(['success' => false, 'message' => 'متن معرفی صفحه بیش از حد طولانی است.'], 422);
}

if (!preg_match('/^#[0-9a-f]{6}$/i', $primaryColor)) {
    json_response(['success' => false, 'message' => 'رنگ اصلی معتبر نیست.'], 422);
}

try {
    new DateTimeZone($timezone);
} catch (Throwable) {
    json_response(['success' => false, 'message' => 'منطقه زمانی معتبر نیست.'], 422);
}

try {
    $pdo->beginTransaction();

    $currentStmt = $pdo->prepare('SELECT id, public_slug FROM hosted_support_pages WHERE site_id = :site_id LIMIT 1 FOR UPDATE');
    $currentStmt->execute([':site_id' => $siteId]);
    $current = $currentStmt->fetch();

    if ($slugInput === '') {
        $slugInput = hosted_support_generate_slug(
            $pdo,
            (string) ($site['brand_name'] ?: $site['name']),
            $current ? (int) $current['id'] : null
        );
    }

    if (!hosted_support_slug_is_valid($slugInput)) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'شناسه لینک باید ۳ تا ۱۲۰ کاراکتر و فقط شامل حروف انگلیسی، عدد و خط تیره باشد.',
        ], 422);
    }

    $duplicateStmt = $pdo->prepare('
        SELECT id
        FROM hosted_support_pages
        WHERE public_slug = :slug
          AND site_id <> :site_id
        LIMIT 1
    ');
    $duplicateStmt->execute([
        ':slug' => $slugInput,
        ':site_id' => $siteId,
    ]);

    if ($duplicateStmt->fetch()) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'این لینک قبلاً استفاده شده است. شناسه دیگری انتخاب کنید.',
        ], 409);
    }

    $pageStmt = $pdo->prepare('
        INSERT INTO hosted_support_pages (
            tenant_id, site_id, public_slug, page_title, page_subtitle,
            page_description, primary_color, contact_phone, whatsapp_phone,
            timezone, require_name, require_phone, show_business_hours,
            show_faq, is_active
        ) VALUES (
            :tenant_id, :site_id, :public_slug, :page_title, :page_subtitle,
            :page_description, :primary_color, :contact_phone, :whatsapp_phone,
            :timezone, :require_name, :require_phone, :show_business_hours,
            :show_faq, :is_active
        )
        ON DUPLICATE KEY UPDATE
            public_slug = VALUES(public_slug),
            page_title = VALUES(page_title),
            page_subtitle = VALUES(page_subtitle),
            page_description = VALUES(page_description),
            primary_color = VALUES(primary_color),
            contact_phone = VALUES(contact_phone),
            whatsapp_phone = VALUES(whatsapp_phone),
            timezone = VALUES(timezone),
            require_name = VALUES(require_name),
            require_phone = VALUES(require_phone),
            show_business_hours = VALUES(show_business_hours),
            show_faq = VALUES(show_faq),
            is_active = VALUES(is_active)
    ');
    $pageStmt->execute([
        ':tenant_id' => $tenantId,
        ':site_id' => $siteId,
        ':public_slug' => $slugInput,
        ':page_title' => $pageTitle,
        ':page_subtitle' => $pageSubtitle !== '' ? $pageSubtitle : null,
        ':page_description' => $pageDescription !== '' ? $pageDescription : null,
        ':primary_color' => $primaryColor,
        ':contact_phone' => $contactPhone !== '' ? $contactPhone : null,
        ':whatsapp_phone' => $whatsappPhone !== '' ? $whatsappPhone : null,
        ':timezone' => $timezone,
        ':require_name' => !empty($pageInput['require_name']) ? 1 : 0,
        ':require_phone' => !empty($pageInput['require_phone']) ? 1 : 0,
        ':show_business_hours' => !empty($pageInput['show_business_hours']) ? 1 : 0,
        ':show_faq' => !empty($pageInput['show_faq']) ? 1 : 0,
        ':is_active' => !empty($pageInput['is_active']) ? 1 : 0,
    ]);

    hosted_support_ensure_defaults($pdo, $siteId);

    if (count($hoursInput) > 0) {
        $hoursStmt = $pdo->prepare('
            INSERT INTO site_business_hours (
                site_id, day_of_week, is_open, open_time, close_time
            ) VALUES (
                :site_id, :day_of_week, :is_open, :open_time, :close_time
            )
            ON DUPLICATE KEY UPDATE
                is_open = VALUES(is_open),
                open_time = VALUES(open_time),
                close_time = VALUES(close_time)
        ');

        foreach ($hoursInput as $hour) {
            if (!is_array($hour)) {
                continue;
            }

            $day = (int) ($hour['day_of_week'] ?? 0);
            $isOpen = !empty($hour['is_open']);
            $openTime = trim((string) ($hour['open_time'] ?? '09:00'));
            $closeTime = trim((string) ($hour['close_time'] ?? '18:00'));

            if ($day < 1 || $day > 7) {
                continue;
            }

            if ($isOpen && (!preg_match('/^\d{2}:\d{2}$/', $openTime) || !preg_match('/^\d{2}:\d{2}$/', $closeTime))) {
                $pdo->rollBack();
                json_response(['success' => false, 'message' => 'ساعت کاری معتبر نیست.'], 422);
            }

            if ($isOpen && $openTime >= $closeTime) {
                $pdo->rollBack();
                json_response(['success' => false, 'message' => 'ساعت پایان باید بعد از ساعت شروع باشد.'], 422);
            }

            $hoursStmt->execute([
                ':site_id' => $siteId,
                ':day_of_week' => $day,
                ':is_open' => $isOpen ? 1 : 0,
                ':open_time' => $isOpen ? $openTime . ':00' : null,
                ':close_time' => $isOpen ? $closeTime . ':00' : null,
            ]);
        }
    }

    $behavior = (string) ($offlineInput['offline_behavior'] ?? 'accept_messages');
    if (!in_array($behavior, ['accept_messages', 'ai_only', 'closed'], true)) {
        $behavior = 'accept_messages';
    }

    $offlineMessage = trim((string) ($offlineInput['offline_message'] ?? ''));
    if (mb_strlen($offlineMessage, 'UTF-8') > 1000) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'پیام آفلاین بیش از حد طولانی است.'], 422);
    }

    $offlineStmt = $pdo->prepare('
        INSERT INTO site_offline_settings (
            site_id, offline_behavior, offline_message,
            ai_after_hours_enabled, show_next_opening
        ) VALUES (
            :site_id, :offline_behavior, :offline_message,
            :ai_after_hours_enabled, :show_next_opening
        )
        ON DUPLICATE KEY UPDATE
            offline_behavior = VALUES(offline_behavior),
            offline_message = VALUES(offline_message),
            ai_after_hours_enabled = VALUES(ai_after_hours_enabled),
            show_next_opening = VALUES(show_next_opening)
    ');
    $offlineStmt->execute([
        ':site_id' => $siteId,
        ':offline_behavior' => $behavior,
        ':offline_message' => $offlineMessage !== '' ? $offlineMessage : null,
        ':ai_after_hours_enabled' => !empty($offlineInput['ai_after_hours_enabled']) ? 1 : 0,
        ':show_next_opening' => !empty($offlineInput['show_next_opening']) ? 1 : 0,
    ]);

    if (array_key_exists('exceptions', $input)) {
        $deleteExceptions = $pdo->prepare('DELETE FROM site_schedule_exceptions WHERE site_id = :site_id AND exception_date >= CURDATE()');
        $deleteExceptions->execute([':site_id' => $siteId]);

        $exceptionStmt = $pdo->prepare('
            INSERT INTO site_schedule_exceptions (
                site_id, exception_date, title, is_closed, open_time, close_time
            ) VALUES (
                :site_id, :exception_date, :title, :is_closed, :open_time, :close_time
            )
        ');

        foreach ($exceptionsInput as $exception) {
            if (!is_array($exception)) {
                continue;
            }

            $date = trim((string) ($exception['exception_date'] ?? ''));
            $title = trim((string) ($exception['title'] ?? ''));
            $isClosed = !empty($exception['is_closed']);
            $openTime = trim((string) ($exception['open_time'] ?? ''));
            $closeTime = trim((string) ($exception['close_time'] ?? ''));

            $dateObject = DateTimeImmutable::createFromFormat('Y-m-d', $date);
            if (!$dateObject || $dateObject->format('Y-m-d') !== $date) {
                continue;
            }

            if (!$isClosed && (!preg_match('/^\d{2}:\d{2}$/', $openTime) || !preg_match('/^\d{2}:\d{2}$/', $closeTime) || $openTime >= $closeTime)) {
                $pdo->rollBack();
                json_response(['success' => false, 'message' => 'ساعت استثنا معتبر نیست.'], 422);
            }

            $exceptionStmt->execute([
                ':site_id' => $siteId,
                ':exception_date' => $date,
                ':title' => $title !== '' ? $title : null,
                ':is_closed' => $isClosed ? 1 : 0,
                ':open_time' => $isClosed ? null : $openTime . ':00',
                ':close_time' => $isClosed ? null : $closeTime . ':00',
            ]);
        }
    }

    $pdo->commit();

    $freshSite = hosted_support_owned_site($pdo, $tenantId, $siteId);
    json_response([
        'success' => true,
        'message' => 'تنظیمات صفحه پشتیبانی ذخیره شد.',
        'selected' => hosted_support_page_payload($pdo, $freshSite),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'ذخیره تنظیمات صفحه پشتیبانی ممکن نیست.',
    ];
    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }
    json_response($payload, 500);
}
