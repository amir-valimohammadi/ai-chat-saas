<?php

// مسیر فایل: backend/includes/contact-requests.php
// هدف: توابع مشترک فرم عمومی مشاوره و مدیریت درخواست‌های مشتریان

declare(strict_types=1);

if (!function_exists('contact_request_types')) {
    function contact_request_types(): array
    {
        return [
            'purchase_plan' => 'خرید پلن',
            'pricing' => 'دریافت قیمت',
            'demo' => 'درخواست دمو',
            'plan_consultation' => 'مشاوره انتخاب پلن',
            'widget_setup' => 'راه‌اندازی ویجت',
            'ai_consultation' => 'مشاوره قابلیت هوش مصنوعی',
            'migration' => 'انتقال از سامانه دیگر',
            'partnership' => 'همکاری تجاری',
            'other' => 'سایر موارد',
        ];
    }
}

if (!function_exists('contact_request_statuses')) {
    function contact_request_statuses(): array
    {
        return [
            'new' => 'جدید',
            'reviewing' => 'در حال بررسی',
            'contacted' => 'تماس گرفته شد',
            'waiting_customer' => 'در انتظار پاسخ مشتری',
            'qualified' => 'واجد شرایط',
            'converted' => 'تبدیل‌شده به مشتری',
            'closed' => 'مختومه',
            'rejected' => 'ردشده',
        ];
    }
}

if (!function_exists('contact_request_priorities')) {
    function contact_request_priorities(): array
    {
        return [
            'low' => 'کم',
            'normal' => 'عادی',
            'high' => 'بالا',
            'urgent' => 'فوری',
        ];
    }
}

if (!function_exists('contact_request_contact_methods')) {
    function contact_request_contact_methods(): array
    {
        return [
            'phone' => 'تماس تلفنی',
            'whatsapp' => 'واتساپ',
        ];
    }
}

if (!function_exists('contact_request_trim')) {
    function contact_request_trim(mixed $value, int $maxLength = 0): string
    {
        $value = trim((string) $value);

        if ($maxLength > 0) {
            $value = function_exists('mb_substr')
                ? mb_substr($value, 0, $maxLength, 'UTF-8')
                : substr($value, 0, $maxLength);
        }

        return $value;
    }
}

if (!function_exists('contact_request_normalize_digits')) {
    function contact_request_normalize_digits(string $value): string
    {
        return strtr($value, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
    }
}

if (!function_exists('contact_request_normalize_phone')) {
    function contact_request_normalize_phone(string $phone): string
    {
        $phone = contact_request_normalize_digits($phone);
        $phone = preg_replace('/[^0-9+]/', '', $phone) ?? '';

        if (str_starts_with($phone, '0098')) {
            $phone = '+98' . substr($phone, 4);
        }

        if (str_starts_with($phone, '+98')) {
            $phone = '0' . substr($phone, 3);
        } elseif (str_starts_with($phone, '98') && strlen($phone) === 12) {
            $phone = '0' . substr($phone, 2);
        }

        return $phone;
    }
}

if (!function_exists('contact_request_valid_phone')) {
    function contact_request_valid_phone(string $phone): bool
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (preg_match('/^09\d{9}$/', $digits) === 1) {
            return true;
        }

        // شماره‌های داخلی که با صفر شروع می‌شوند باید موبایل باشند؛
        // شماره‌های بین‌المللی بدون صفر ابتدایی پذیرفته می‌شوند.
        if (str_starts_with($digits, '0')) {
            return false;
        }

        return strlen($digits) >= 10 && strlen($digits) <= 15;
    }
}

if (!function_exists('contact_request_whatsapp_phone')) {
    function contact_request_whatsapp_phone(string $phone): string
    {
        $phone = contact_request_normalize_phone($phone);
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (preg_match('/^09\d{9}$/', $digits) === 1) {
            return '98' . substr($digits, 1);
        }

        return ltrim($digits, '0');
    }
}

if (!function_exists('contact_request_normalize_website')) {
    function contact_request_normalize_website(string $website): ?string
    {
        $website = contact_request_trim($website, 500);

        if ($website === '') {
            return null;
        }

        if (!preg_match('#^https?://#i', $website)) {
            $website = 'https://' . $website;
        }

        if (!filter_var($website, FILTER_VALIDATE_URL)) {
            return null;
        }

        $parts = parse_url($website);

        if (!$parts || empty($parts['host'])) {
            return null;
        }

        return rtrim($website, '/');
    }
}

if (!function_exists('contact_request_tracking_code')) {
    function contact_request_tracking_code(): string
    {
        return 'REQ-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
    }
}

if (!function_exists('contact_request_insert_event')) {
    function contact_request_insert_event(
        PDO $pdo,
        int $requestId,
        string $eventType,
        ?array $actor = null,
        ?string $note = null,
        ?string $oldStatus = null,
        ?string $newStatus = null,
        ?array $metadata = null
    ): int {
        $stmt = $pdo->prepare("\n            INSERT INTO customer_request_events (\n                request_id, actor_user_id, actor_name, event_type, note,\n                old_status, new_status, metadata_json\n            ) VALUES (\n                :request_id, :actor_user_id, :actor_name, :event_type, :note,\n                :old_status, :new_status, :metadata_json\n            )\n        ");

        $metadataJson = null;
        if ($metadata !== null && $metadata !== []) {
            $metadataJson = json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        $stmt->execute([
            ':request_id' => $requestId,
            ':actor_user_id' => isset($actor['id']) ? (int) $actor['id'] : null,
            ':actor_name' => $actor['name'] ?? null,
            ':event_type' => contact_request_trim($eventType, 50),
            ':note' => $note !== null ? contact_request_trim($note, 3000) : null,
            ':old_status' => $oldStatus,
            ':new_status' => $newStatus,
            ':metadata_json' => $metadataJson,
        ]);

        return (int) $pdo->lastInsertId();
    }
}

if (!function_exists('contact_request_labels_payload')) {
    function contact_request_labels_payload(): array
    {
        return [
            'types' => contact_request_types(),
            'statuses' => contact_request_statuses(),
            'priorities' => contact_request_priorities(),
            'contact_methods' => contact_request_contact_methods(),
        ];
    }
}
