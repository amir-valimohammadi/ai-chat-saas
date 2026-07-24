<?php

declare(strict_types=1);

if (!function_exists('customer360_default_onboarding_items')) {
    function customer360_default_onboarding_items(): array
    {
        return [
            ['account_created', 'ساخت حساب مدیر مشتری', 10],
            ['site_created', 'ساخت اولین سایت', 20],
            ['widget_installed', 'نصب و تأیید ویجت', 30],
            ['team_invited', 'دعوت اعضای تیم', 40],
            ['knowledge_ready', 'تکمیل منبع دانش', 50],
            ['first_conversation', 'ثبت اولین گفتگو', 60],
        ];
    }
}

if (!function_exists('customer360_ensure_onboarding')) {
    function customer360_ensure_onboarding(PDO $pdo, int $tenantId): void
    {
        $stmt = $pdo->prepare("\n            INSERT IGNORE INTO tenant_onboarding_items(tenant_id,item_key,title,sort_order)\n            VALUES(:tenant_id,:item_key,:title,:sort_order)\n        ");
        foreach (customer360_default_onboarding_items() as [$key, $title, $order]) {
            $stmt->execute([
                ':tenant_id' => $tenantId,
                ':item_key' => $key,
                ':title' => $title,
                ':sort_order' => $order,
            ]);
        }
    }
}

if (!function_exists('customer360_sync_detectable_onboarding')) {
    function customer360_sync_detectable_onboarding(PDO $pdo, int $tenantId): void
    {
        $checks = [
            'account_created' => "SELECT COUNT(*) FROM users WHERE tenant_id=:tenant_id AND role='customer_admin'",
            'site_created' => "SELECT COUNT(*) FROM sites WHERE tenant_id=:tenant_id",
            'team_invited' => "SELECT COUNT(*) FROM users WHERE tenant_id=:tenant_id AND role='agent'",
            'knowledge_ready' => "SELECT COUNT(*) FROM knowledge_sources ks INNER JOIN sites s ON s.id=ks.site_id WHERE s.tenant_id=:tenant_id AND ks.status='approved'",
            'first_conversation' => "SELECT COUNT(*) FROM conversations c INNER JOIN sites s ON s.id=c.site_id WHERE s.tenant_id=:tenant_id",
        ];

        $update = $pdo->prepare("\n            UPDATE tenant_onboarding_items\n            SET status='done',completed_at=COALESCE(completed_at,NOW())\n            WHERE tenant_id=:tenant_id AND item_key=:item_key AND status IN ('pending','in_progress')\n        ");

        foreach ($checks as $itemKey => $sql) {
            try {
                $stmt = $pdo->prepare($sql);
                $stmt->execute([':tenant_id' => $tenantId]);
                if ((int) $stmt->fetchColumn() > 0) {
                    $update->execute([':tenant_id' => $tenantId, ':item_key' => $itemKey]);
                }
            } catch (Throwable $e) {
                // Older installations may not have every optional table yet.
                error_log('[AI_CHAT_SAAS_CUSTOMER360_ONBOARDING] ' . $e->getMessage());
            }
        }

        $progressStmt = $pdo->prepare("\n            SELECT COUNT(*) total_count,SUM(status IN ('done','skipped')) completed_count\n            FROM tenant_onboarding_items WHERE tenant_id=:tenant_id\n        ");
        $progressStmt->execute([':tenant_id' => $tenantId]);
        $progress = $progressStmt->fetch() ?: [];
        $total = (int) ($progress['total_count'] ?? 0);
        $completed = (int) ($progress['completed_count'] ?? 0);
        if ($total > 0 && $completed >= $total) {
            $pdo->prepare("UPDATE tenants SET onboarding_completed_at=COALESCE(onboarding_completed_at,NOW()),lifecycle_stage=IF(lifecycle_stage='onboarding','active',lifecycle_stage) WHERE id=:id")
                ->execute([':id' => $tenantId]);
        }
    }
}

if (!function_exists('customer360_decode_json')) {
    function customer360_decode_json(?string $value): ?array
    {
        if ($value === null || trim($value) === '') {
            return null;
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : null;
    }
}

if (!function_exists('customer360_health')) {
    function customer360_health(array $signals): array
    {
        $score = 100;
        $reasons = [];

        if (($signals['tenant_status'] ?? 'active') !== 'active') {
            $score -= 45;
            $reasons[] = 'حساب مشتری فعال نیست.';
        }
        if (in_array(($signals['subscription_status'] ?? null), ['past_due','expired','cancelled','suspended'], true)) {
            $score -= 25;
            $reasons[] = 'وضعیت اشتراک نیازمند پیگیری است.';
        }
        $daysLeft = $signals['subscription_days_left'] ?? null;
        if (is_int($daysLeft) && $daysLeft >= 0 && $daysLeft <= 14) {
            $score -= 12;
            $reasons[] = 'اشتراک کمتر از ۱۴ روز دیگر پایان می‌یابد.';
        }
        if (!empty($signals['usage_over_limit'])) {
            $score -= 20;
            $reasons[] = 'حداقل یکی از محدودیت‌های پلن رد شده است.';
        } elseif (!empty($signals['usage_near_limit'])) {
            $score -= 10;
            $reasons[] = 'مصرف مشتری به سقف پلن نزدیک است.';
        }
        if (($signals['failed_crawls'] ?? 0) > 0) {
            $score -= min(15, (int) $signals['failed_crawls'] * 5);
            $reasons[] = 'خزش ناموفق ثبت شده است.';
        }
        if (($signals['onboarding_percent'] ?? 100) < 50) {
            $score -= 10;
            $reasons[] = 'راه‌اندازی مشتری هنوز کامل نشده است.';
        }
        if (($signals['days_since_activity'] ?? 0) > 30) {
            $score -= 15;
            $reasons[] = 'بیش از ۳۰ روز فعالیتی ثبت نشده است.';
        }

        $score = max(0, min(100, $score));
        $level = $score >= 80 ? 'healthy' : ($score >= 55 ? 'attention' : 'critical');
        return ['score' => $score, 'level' => $level, 'reasons' => array_values(array_unique($reasons))];
    }
}
