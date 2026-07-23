<?php

// Messaging phase 6: shared helpers for visitor presence and safe browser metadata.

function visitor_presence_online_seconds(): int
{
    return max(30, min(300, (int) app_env('VISITOR_ONLINE_SECONDS', 75)));
}

function visitor_presence_idle_seconds(): int
{
    return max(visitor_presence_online_seconds() + 30, min(1800, (int) app_env('VISITOR_IDLE_SECONDS', 300)));
}

function visitor_presence_invite_ttl_seconds(): int
{
    return max(60, min(1800, (int) app_env('VISITOR_INVITE_TTL_SECONDS', 300)));
}

function visitor_presence_status(?string $lastSeenAt): string
{
    if (!$lastSeenAt) return 'offline';
    $timestamp = strtotime($lastSeenAt);
    if ($timestamp === false) return 'offline';
    $age = time() - $timestamp;
    if ($age <= visitor_presence_online_seconds()) return 'online';
    if ($age <= visitor_presence_idle_seconds()) return 'idle';
    return 'offline';
}

function visitor_presence_url(string $value, int $maxLength = 1000): ?string
{
    $value = trim($value);
    if ($value === '' || mb_strlen($value, 'UTF-8') > $maxLength) return null;
    $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));
    if (!filter_var($value, FILTER_VALIDATE_URL) || !in_array($scheme, ['http', 'https'], true)) return null;
    return $value;
}

function visitor_presence_text(string $value, int $maxLength): ?string
{
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    if ($value === '') return null;
    return mb_substr($value, 0, $maxLength, 'UTF-8');
}

function visitor_presence_parse_user_agent(string $userAgent): array
{
    $ua = strtolower($userAgent);
    $device = 'desktop';
    if (preg_match('/bot|crawler|spider|slurp|bingpreview/', $ua)) $device = 'bot';
    elseif (preg_match('/ipad|tablet|kindle|silk|playbook/', $ua)) $device = 'tablet';
    elseif (preg_match('/mobile|iphone|ipod|android.*mobile|windows phone/', $ua)) $device = 'mobile';

    $browser = 'Unknown';
    if (str_contains($ua, 'edg/')) $browser = 'Edge';
    elseif (str_contains($ua, 'opr/') || str_contains($ua, 'opera')) $browser = 'Opera';
    elseif (str_contains($ua, 'firefox/')) $browser = 'Firefox';
    elseif (str_contains($ua, 'chrome/') && !str_contains($ua, 'chromium/')) $browser = 'Chrome';
    elseif (str_contains($ua, 'safari/') && str_contains($ua, 'version/')) $browser = 'Safari';

    $os = 'Unknown';
    if (str_contains($ua, 'windows nt 10')) $os = 'Windows 10/11';
    elseif (str_contains($ua, 'windows')) $os = 'Windows';
    elseif (preg_match('/iphone|ipad|ipod/', $ua)) $os = 'iOS';
    elseif (str_contains($ua, 'android')) $os = 'Android';
    elseif (str_contains($ua, 'mac os x')) $os = 'macOS';
    elseif (str_contains($ua, 'linux')) $os = 'Linux';

    return ['device_type' => $device, 'browser_name' => $browser, 'operating_system' => $os];
}

function visitor_presence_access_condition(array $user, string $siteAlias = 'sites'): array
{
    if ($user['role'] === 'agent') {
        return [
            "EXISTS (SELECT 1 FROM agent_site_access asa WHERE asa.site_id = {$siteAlias}.id AND asa.user_id = :access_user_id)",
            [':access_user_id' => (int) $user['id']],
        ];
    }
    return ['1=1', []];
}
