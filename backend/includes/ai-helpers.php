<?php

// مسیر فایل: ai-chat-saas/backend/includes/ai-helpers.php
// هدف: توابع کمکی مشترک برای بخش AI Knowledge

require_once __DIR__ . '/response.php';

if (!function_exists('ai_bool')) {
    function ai_bool($value): int
    {
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }

        if (is_numeric($value)) {
            return ((int) $value) === 1 ? 1 : 0;
        }

        $value = strtolower(trim((string) $value));

        return in_array($value, ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
    }
}

if (!function_exists('ai_score')) {
    function ai_score($value, float $default, float $min = 0.00, float $max = 100.00): float
    {
        if ($value === null || $value === '') {
            return $default;
        }

        if (!is_numeric($value)) {
            return $default;
        }

        $score = (float) $value;

        if ($score < $min) {
            return $min;
        }

        if ($score > $max) {
            return $max;
        }

        return round($score, 2);
    }
}

if (!function_exists('ai_get_customer_site')) {
    function ai_get_customer_site(PDO $pdo, array $user, int $siteId): array
    {
        if ($siteId <= 0) {
            json_response([
                'success' => false,
                'message' => 'Site ID is required'
            ], 422);
        }

        $stmt = $pdo->prepare(" 
            SELECT id, tenant_id, name, domain, site_key
            FROM sites
            WHERE id = :site_id
              AND tenant_id = :tenant_id
            LIMIT 1
        ");

        $stmt->execute([
            ':site_id' => $siteId,
            ':tenant_id' => $user['tenant_id'],
        ]);

        $site = $stmt->fetch();

        if (!$site) {
            json_response([
                'success' => false,
                'message' => 'Site not found'
            ], 404);
        }

        return $site;
    }
}

if (!function_exists('ai_normalize_host')) {
    function ai_normalize_host(string $value): string
    {
        $value = trim(strtolower($value));

        if ($value === '') {
            return '';
        }

        if (!preg_match('/^https?:\/\//i', $value)) {
            $value = 'https://' . $value;
        }

        $host = parse_url($value, PHP_URL_HOST);

        if (!$host) {
            return '';
        }

        $host = strtolower($host);

        if (str_starts_with($host, 'www.')) {
            $host = substr($host, 4);
        }

        return $host;
    }
}

if (!function_exists('ai_host_belongs_to_site')) {
    function ai_host_belongs_to_site(string $host, string $siteDomain): bool
    {
        $host = ai_normalize_host($host);
        $siteHost = ai_normalize_host($siteDomain);

        if ($host === '' || $siteHost === '') {
            return false;
        }

        if ($host === $siteHost) {
            return true;
        }

        return str_ends_with($host, '.' . $siteHost);
    }
}

if (!function_exists('ai_validate_crawl_source')) {
    function ai_validate_crawl_source(string $sourceType, string $sourceValue, string $siteDomain): string
    {
        $sourceType = trim($sourceType);
        $sourceValue = trim($sourceValue);

        $allowedTypes = ['url', 'path_prefix', 'sitemap'];

        if (!in_array($sourceType, $allowedTypes, true)) {
            json_response([
                'success' => false,
                'message' => 'Invalid crawl source type'
            ], 422);
        }

        if ($sourceValue === '') {
            json_response([
                'success' => false,
                'message' => 'Crawl source value is required'
            ], 422);
        }

        if (mb_strlen($sourceValue) > 1000) {
            json_response([
                'success' => false,
                'message' => 'Crawl source value is too long'
            ], 422);
        }

        if ($sourceType === 'path_prefix') {
            if (!str_starts_with($sourceValue, '/')) {
                json_response([
                    'success' => false,
                    'message' => 'Path prefix must start with /'
                ], 422);
            }

            return $sourceValue;
        }

        if (preg_match('/^https?:\/\//i', $sourceValue)) {
            $urlHost = parse_url($sourceValue, PHP_URL_HOST);

            if (!$urlHost || !ai_host_belongs_to_site($urlHost, $siteDomain)) {
                json_response([
                    'success' => false,
                    'message' => 'Crawl source must belong to the selected site domain'
                ], 422);
            }

            return strtok($sourceValue, '#') ?: $sourceValue;
        }

        if (!str_starts_with($sourceValue, '/')) {
            json_response([
                'success' => false,
                'message' => 'Crawl source must be a full URL or a path starting with /'
            ], 422);
        }

        return $sourceValue;
    }
}

if (!function_exists('ai_trim_or_null')) {
    function ai_trim_or_null($value, int $maxLength = 255): ?string
    {
        $value = trim((string) ($value ?? ''));

        if ($value === '') {
            return null;
        }

        if (mb_strlen($value) > $maxLength) {
            return mb_substr($value, 0, $maxLength);
        }

        return $value;
    }
}