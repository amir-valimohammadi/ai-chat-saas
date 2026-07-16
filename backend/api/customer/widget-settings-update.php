<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/widget-settings-update.php
// هدف: ویرایش امن تنظیمات ویجت یک سایت توسط Customer Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/plan-limits.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$input = get_json_input();

function widget_setting_string(array $input, string $key, string $default = ''): string
{
    $value = $input[$key] ?? $default;

    if (!is_string($value)) {
        return $default;
    }

    return trim($value);
}

function widget_setting_length(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

$siteId = isset($input['site_id']) ? (int) $input['site_id'] : 0;
$brandName = widget_setting_string($input, 'brand_name');
$brandColor = strtolower(widget_setting_string($input, 'brand_color', '#2563eb'));
$logoUrl = widget_setting_string($input, 'logo_url');
$welcomeMessage = widget_setting_string($input, 'welcome_message');
$aiMode = widget_setting_string($input, 'ai_mode', 'assistant');

$allowedAiModes = ['off', 'assistant', 'semi_auto'];

if ($siteId <= 0) {
    json_response([
        'success' => false,
        'message' => 'شناسه سایت الزامی است.',
    ], 422);
}

if ($brandName !== '' && widget_setting_length($brandName) > 80) {
    json_response([
        'success' => false,
        'message' => 'نام برند نباید بیشتر از ۸۰ کاراکتر باشد.',
    ], 422);
}

if (!preg_match('/^#[0-9a-f]{6}$/', $brandColor)) {
    json_response([
        'success' => false,
        'message' => 'رنگ برند باید با فرمت شش‌رقمی Hex مانند #2563eb وارد شود.',
    ], 422);
}

if ($logoUrl !== '') {
    if (widget_setting_length($logoUrl) > 2048) {
        json_response([
            'success' => false,
            'message' => 'آدرس لوگو بیش از حد طولانی است.',
        ], 422);
    }

    if (filter_var($logoUrl, FILTER_VALIDATE_URL) === false) {
        json_response([
            'success' => false,
            'message' => 'آدرس لوگو معتبر نیست.',
        ], 422);
    }

    $logoScheme = strtolower((string) parse_url($logoUrl, PHP_URL_SCHEME));

    if (!in_array($logoScheme, ['http', 'https'], true)) {
        json_response([
            'success' => false,
            'message' => 'آدرس لوگو فقط می‌تواند با http یا https شروع شود.',
        ], 422);
    }
}

if (widget_setting_length($welcomeMessage) > 300) {
    json_response([
        'success' => false,
        'message' => 'پیام خوش‌آمدگویی نباید بیشتر از ۳۰۰ کاراکتر باشد.',
    ], 422);
}

if (!in_array($aiMode, $allowedAiModes, true)) {
    json_response([
        'success' => false,
        'message' => 'حالت انتخاب‌شده برای هوش مصنوعی معتبر نیست.',
    ], 422);
}

try {
    if ($aiMode === 'semi_auto') {
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

    $siteStmt = $pdo->prepare("
        SELECT id
        FROM sites
        WHERE id = :id
          AND tenant_id = :tenant_id
        LIMIT 1
    ");

    $siteStmt->execute([
        ':id' => $siteId,
        ':tenant_id' => (int) $user['tenant_id'],
    ]);

    if (!$siteStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'سایت موردنظر پیدا نشد.',
        ], 404);
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        UPDATE sites
        SET
            brand_name = :brand_name,
            brand_color = :brand_color,
            logo_url = :logo_url,
            welcome_message = :welcome_message,
            ai_mode = :ai_mode
        WHERE id = :id
          AND tenant_id = :tenant_id
    ");

    $stmt->execute([
        ':brand_name' => $brandName !== '' ? $brandName : null,
        ':brand_color' => $brandColor,
        ':logo_url' => $logoUrl !== '' ? $logoUrl : null,
        ':welcome_message' => $welcomeMessage !== '' ? $welcomeMessage : null,
        ':ai_mode' => $aiMode,
        ':id' => $siteId,
        ':tenant_id' => (int) $user['tenant_id'],
    ]);

    $assistantEnabled = $aiMode === 'off' ? 0 : 1;
    $autoReplyEnabled = $aiMode === 'semi_auto' ? 1 : 0;

    $aiSettingsStmt = $pdo->prepare("
        INSERT INTO ai_site_settings (
            tenant_id,
            site_id,
            assistant_enabled,
            auto_reply_enabled
        ) VALUES (
            :tenant_id,
            :site_id,
            :assistant_enabled,
            :auto_reply_enabled
        )
        ON DUPLICATE KEY UPDATE
            assistant_enabled = VALUES(assistant_enabled),
            auto_reply_enabled = VALUES(auto_reply_enabled)
    ");
    $aiSettingsStmt->execute([
        ':tenant_id' => (int) $user['tenant_id'],
        ':site_id' => $siteId,
        ':assistant_enabled' => $assistantEnabled,
        ':auto_reply_enabled' => $autoReplyEnabled,
    ]);

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'تنظیمات ویجت با موفقیت ذخیره شد.',
        'site' => [
            'id' => $siteId,
            'brand_name' => $brandName !== '' ? $brandName : null,
            'brand_color' => $brandColor,
            'logo_url' => $logoUrl !== '' ? $logoUrl : null,
            'welcome_message' => $welcomeMessage !== '' ? $welcomeMessage : null,
            'ai_mode' => $aiMode,
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'ذخیره تنظیمات ویجت با خطا مواجه شد.',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
