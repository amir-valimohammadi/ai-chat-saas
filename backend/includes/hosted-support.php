<?php

// مسیر فایل: ai-chat-saas/backend/includes/hosted-support.php
// هدف: ابزارهای مشترک صفحه پشتیبانی اختصاصی، ساعت کاری و حالت آفلاین

require_once __DIR__ . '/../config/app.php';

if (!function_exists('hosted_support_normalize_slug')) {
    function hosted_support_normalize_slug(string $value): string
    {
        $value = trim(mb_strtolower($value, 'UTF-8'));
        $value = str_replace(['_', ' '], '-', $value);
        $value = preg_replace('/[^a-z0-9\-]+/i', '-', $value) ?? '';
        $value = preg_replace('/-+/', '-', $value) ?? '';
        return trim($value, '-');
    }
}

if (!function_exists('hosted_support_slug_is_valid')) {
    function hosted_support_slug_is_valid(string $slug): bool
    {
        return (bool) preg_match('/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/', $slug);
    }
}

if (!function_exists('hosted_support_generate_slug')) {
    function hosted_support_generate_slug(PDO $pdo, string $seed, ?int $excludePageId = null): string
    {
        $base = hosted_support_normalize_slug($seed);

        if ($base === '' || mb_strlen($base, 'UTF-8') < 3) {
            $base = 'support-' . substr(bin2hex(random_bytes(4)), 0, 8);
        }

        $base = mb_substr($base, 0, 100, 'UTF-8');
        $candidate = $base;
        $counter = 1;

        while (true) {
            $sql = 'SELECT id FROM hosted_support_pages WHERE public_slug = :slug';
            $params = [':slug' => $candidate];

            if ($excludePageId !== null) {
                $sql .= ' AND id <> :exclude_id';
                $params[':exclude_id'] = $excludePageId;
            }

            $sql .= ' LIMIT 1';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if (!$stmt->fetch()) {
                return $candidate;
            }

            $counter++;
            $suffix = '-' . $counter;
            $candidate = mb_substr($base, 0, 120 - mb_strlen($suffix, 'UTF-8'), 'UTF-8') . $suffix;
        }
    }
}

if (!function_exists('hosted_support_public_url')) {
    function hosted_support_public_url(string $slug): string
    {
        $frontendUrl = rtrim((string) app_config('frontend_url', 'http://localhost:3000'), '/');
        return $frontendUrl . '/support/' . rawurlencode($slug);
    }
}

if (!function_exists('hosted_support_default_hours')) {
    function hosted_support_default_hours(): array
    {
        return [
            ['day_of_week' => 1, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '18:00'], // Monday
            ['day_of_week' => 2, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '18:00'],
            ['day_of_week' => 3, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '18:00'],
            ['day_of_week' => 4, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '18:00'],
            ['day_of_week' => 5, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '14:00'], // Friday
            ['day_of_week' => 6, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '18:00'], // Saturday
            ['day_of_week' => 7, 'is_open' => 1, 'open_time' => '09:00', 'close_time' => '18:00'], // Sunday
        ];
    }
}

if (!function_exists('hosted_support_ensure_defaults')) {
    function hosted_support_ensure_defaults(PDO $pdo, int $siteId): void
    {
        $hourStmt = $pdo->prepare('
            INSERT IGNORE INTO site_business_hours (
                site_id, day_of_week, is_open, open_time, close_time
            ) VALUES (
                :site_id, :day_of_week, :is_open, :open_time, :close_time
            )
        ');

        foreach (hosted_support_default_hours() as $row) {
            $hourStmt->execute([
                ':site_id' => $siteId,
                ':day_of_week' => $row['day_of_week'],
                ':is_open' => $row['is_open'],
                ':open_time' => $row['open_time'] . ':00',
                ':close_time' => $row['close_time'] . ':00',
            ]);
        }

        $offlineStmt = $pdo->prepare('
            INSERT IGNORE INTO site_offline_settings (
                site_id, offline_behavior, offline_message,
                ai_after_hours_enabled, show_next_opening
            ) VALUES (
                :site_id, \'accept_messages\', :offline_message, 1, 1
            )
        ');
        $offlineStmt->execute([
            ':site_id' => $siteId,
            ':offline_message' => 'در حال حاضر خارج از ساعت پاسخ‌گویی هستیم. پیام شما ثبت می‌شود و در اولین فرصت پاسخ می‌دهیم.',
        ]);
    }
}

if (!function_exists('hosted_support_day_label')) {
    function hosted_support_day_label(int $isoDay): string
    {
        $labels = [
            1 => 'دوشنبه',
            2 => 'سه‌شنبه',
            3 => 'چهارشنبه',
            4 => 'پنجشنبه',
            5 => 'جمعه',
            6 => 'شنبه',
            7 => 'یکشنبه',
        ];

        return $labels[$isoDay] ?? 'روز نامشخص';
    }
}

if (!function_exists('hosted_support_format_time')) {
    function hosted_support_format_time(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);
        if ($value === '') {
            return null;
        }

        // فقط یک زمان معتبر 24 ساعته را استخراج می‌کنیم. این کار در برابر
        // مقادیر آلوده یا چسبیدن ناخواسته نام فایل به زمان نیز مقاوم است.
        if (!preg_match('/(?:^|\D)([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:$|\D)/', $value, $matches)) {
            return null;
        }

        return $matches[1] . ':' . $matches[2];
    }
}

if (!function_exists('hosted_support_datetime_at')) {
    function hosted_support_datetime_at(DateTimeImmutable $date, ?string $time): ?DateTimeImmutable
    {
        $normalized = hosted_support_format_time($time);
        if ($normalized === null) {
            return null;
        }

        [$hour, $minute] = array_map('intval', explode(':', $normalized, 2));

        // به‌جای ساخت رشته تاریخ/زمان و parse مجدد، زمان را مستقیم روی همان
        // DateTimeImmutable و همان timezone قرار می‌دهیم.
        return $date->setTime($hour, $minute, 0);
    }
}

if (!function_exists('hosted_support_get_hours')) {
    function hosted_support_get_hours(PDO $pdo, int $siteId): array
    {
        hosted_support_ensure_defaults($pdo, $siteId);

        $stmt = $pdo->prepare('
            SELECT day_of_week, is_open, open_time, close_time
            FROM site_business_hours
            WHERE site_id = :site_id
            ORDER BY CASE day_of_week
                WHEN 6 THEN 1
                WHEN 7 THEN 2
                WHEN 1 THEN 3
                WHEN 2 THEN 4
                WHEN 3 THEN 5
                WHEN 4 THEN 6
                WHEN 5 THEN 7
                ELSE 8
            END
        ');
        $stmt->execute([':site_id' => $siteId]);

        return array_map(static function (array $row): array {
            return [
                'day_of_week' => (int) $row['day_of_week'],
                'day_label' => hosted_support_day_label((int) $row['day_of_week']),
                'is_open' => (bool) $row['is_open'],
                'open_time' => hosted_support_format_time($row['open_time']),
                'close_time' => hosted_support_format_time($row['close_time']),
            ];
        }, $stmt->fetchAll());
    }
}

if (!function_exists('hosted_support_get_offline_settings')) {
    function hosted_support_get_offline_settings(PDO $pdo, int $siteId): array
    {
        hosted_support_ensure_defaults($pdo, $siteId);

        $stmt = $pdo->prepare('
            SELECT offline_behavior, offline_message,
                   ai_after_hours_enabled, show_next_opening
            FROM site_offline_settings
            WHERE site_id = :site_id
            LIMIT 1
        ');
        $stmt->execute([':site_id' => $siteId]);
        $row = $stmt->fetch() ?: [];

        return [
            'offline_behavior' => $row['offline_behavior'] ?? 'accept_messages',
            'offline_message' => $row['offline_message'] ?? 'پیام شما ثبت می‌شود و در اولین فرصت پاسخ می‌دهیم.',
            'ai_after_hours_enabled' => (bool) ($row['ai_after_hours_enabled'] ?? true),
            'show_next_opening' => (bool) ($row['show_next_opening'] ?? true),
        ];
    }
}

if (!function_exists('hosted_support_agent_online')) {
    function hosted_support_agent_online(PDO $pdo, int $siteId): bool
    {
        $stmt = $pdo->prepare('
            SELECT COUNT(*) AS online_count
            FROM users
            INNER JOIN sites ON sites.tenant_id = users.tenant_id
            WHERE sites.id = :site_id
              AND users.is_active = 1
              AND users.role IN (\'customer_admin\', \'agent\')
              AND users.availability_status = \'online\'
              AND users.last_seen_at IS NOT NULL
              AND users.last_seen_at >= (NOW() - INTERVAL 2 MINUTE)
        ');
        $stmt->execute([':site_id' => $siteId]);
        return ((int) ($stmt->fetch()['online_count'] ?? 0)) > 0;
    }
}

if (!function_exists('hosted_support_schedule_for_date')) {
    function hosted_support_schedule_for_date(PDO $pdo, int $siteId, DateTimeImmutable $date): array
    {
        $dateString = $date->format('Y-m-d');

        $exceptionStmt = $pdo->prepare('
            SELECT title, is_closed, open_time, close_time
            FROM site_schedule_exceptions
            WHERE site_id = :site_id
              AND exception_date = :exception_date
            LIMIT 1
        ');
        $exceptionStmt->execute([
            ':site_id' => $siteId,
            ':exception_date' => $dateString,
        ]);
        $exception = $exceptionStmt->fetch();

        if ($exception) {
            return [
                'is_open' => !(bool) $exception['is_closed'],
                'open_time' => hosted_support_format_time($exception['open_time']),
                'close_time' => hosted_support_format_time($exception['close_time']),
                'source' => 'exception',
                'title' => $exception['title'] ?: null,
            ];
        }

        $day = (int) $date->format('N');
        $stmt = $pdo->prepare('
            SELECT is_open, open_time, close_time
            FROM site_business_hours
            WHERE site_id = :site_id
              AND day_of_week = :day_of_week
            LIMIT 1
        ');
        $stmt->execute([
            ':site_id' => $siteId,
            ':day_of_week' => $day,
        ]);
        $row = $stmt->fetch();

        if (!$row) {
            return [
                'is_open' => false,
                'open_time' => null,
                'close_time' => null,
                'source' => 'none',
                'title' => null,
            ];
        }

        return [
            'is_open' => (bool) $row['is_open'],
            'open_time' => hosted_support_format_time($row['open_time']),
            'close_time' => hosted_support_format_time($row['close_time']),
            'source' => 'weekly',
            'title' => null,
        ];
    }
}

if (!function_exists('hosted_support_next_opening')) {
    function hosted_support_next_opening(PDO $pdo, int $siteId, DateTimeImmutable $now): ?array
    {
        for ($offset = 0; $offset <= 14; $offset++) {
            $date = $now->modify('+' . $offset . ' day');
            $schedule = hosted_support_schedule_for_date($pdo, $siteId, $date);

            if (!$schedule['is_open'] || !$schedule['open_time']) {
                continue;
            }

            $opening = hosted_support_datetime_at($date, $schedule['open_time']);
            if ($opening === null || $opening <= $now) {
                continue;
            }

            return [
                'date' => $opening->format('Y-m-d'),
                'time' => $opening->format('H:i'),
                'day_label' => hosted_support_day_label((int) $opening->format('N')),
                'human_text' => $offset === 0
                    ? 'امروز ساعت ' . $opening->format('H:i')
                    : ($offset === 1
                        ? 'فردا ساعت ' . $opening->format('H:i')
                        : hosted_support_day_label((int) $opening->format('N')) . ' ساعت ' . $opening->format('H:i')),
            ];
        }

        return null;
    }
}

if (!function_exists('hosted_support_site_timezone')) {
    function hosted_support_site_timezone(PDO $pdo, int $siteId): string
    {
        $stmt = $pdo->prepare('SELECT timezone FROM hosted_support_pages WHERE site_id = :site_id LIMIT 1');
        $stmt->execute([':site_id' => $siteId]);
        $timezone = trim((string) ($stmt->fetch()['timezone'] ?? ''));

        return $timezone !== '' ? $timezone : 'Asia/Tehran';
    }
}

if (!function_exists('hosted_support_compute_status')) {
    function hosted_support_compute_status(PDO $pdo, int $siteId, string $timezone = 'Asia/Tehran'): array
    {
        hosted_support_ensure_defaults($pdo, $siteId);

        try {
            $tz = new DateTimeZone($timezone ?: 'Asia/Tehran');
        } catch (Throwable) {
            $timezone = 'Asia/Tehran';
            $tz = new DateTimeZone($timezone);
        }

        $now = new DateTimeImmutable('now', $tz);
        $schedule = hosted_support_schedule_for_date($pdo, $siteId, $now);
        $currentTime = $now->format('H:i');
        $withinHours = false;

        if ($schedule['is_open'] && $schedule['open_time'] && $schedule['close_time']) {
            $withinHours = $currentTime >= $schedule['open_time']
                && $currentTime < $schedule['close_time'];
        }

        $agentOnline = hosted_support_agent_online($pdo, $siteId);
        $offline = hosted_support_get_offline_settings($pdo, $siteId);
        $effectiveOnline = $withinHours && $agentOnline;
        $nextOpening = $offline['show_next_opening']
            ? hosted_support_next_opening($pdo, $siteId, $now)
            : null;

        if (!$withinHours) {
            $statusText = 'خارج از ساعت پاسخ‌گویی';
        } elseif (!$agentOnline) {
            $statusText = 'پشتیبان در حال حاضر آنلاین نیست';
        } else {
            $statusText = 'پشتیبانی آنلاین است';
        }

        return [
            'timezone' => $timezone,
            'server_time' => $now->format('Y-m-d H:i:s'),
            'is_within_business_hours' => $withinHours,
            'agent_online' => $agentOnline,
            'support_online' => $effectiveOnline,
            'status_text' => $statusText,
            'today_schedule' => [
                'day_label' => hosted_support_day_label((int) $now->format('N')),
                'is_open' => $schedule['is_open'],
                'open_time' => $schedule['open_time'],
                'close_time' => $schedule['close_time'],
                'source' => $schedule['source'],
                'title' => $schedule['title'],
            ],
            'next_opening' => $nextOpening,
            'offline' => $offline,
            'chat_available' => $effectiveOnline || $offline['offline_behavior'] !== 'closed',
            'ai_available' => $effectiveOnline || $offline['ai_after_hours_enabled'],
        ];
    }
}
