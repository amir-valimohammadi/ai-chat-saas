<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';

if (!function_exists('totp_base32_encode')) {
    function totp_base32_encode(string $data): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bits = '';
        foreach (str_split($data) as $char) {
            $bits .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($bits, 5) as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $output .= $alphabet[bindec($chunk)];
        }
        return $output;
    }
}

if (!function_exists('totp_base32_decode')) {
    function totp_base32_decode(string $secret): string
    {
        $alphabet = array_flip(str_split('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'));
        $bits = '';
        foreach (str_split(strtoupper(preg_replace('/\s+/', '', $secret))) as $char) {
            if (!isset($alphabet[$char])) {
                return '';
            }
            $bits .= str_pad(decbin($alphabet[$char]), 5, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $output .= chr(bindec($chunk));
            }
        }
        return $output;
    }
}

if (!function_exists('totp_generate_secret')) {
    function totp_generate_secret(): string
    {
        return totp_base32_encode(random_bytes(20));
    }
}

if (!function_exists('totp_code')) {
    function totp_code(string $secret, ?int $time = null): string
    {
        $counter = intdiv($time ?? time(), 30);
        $binaryCounter = pack('N*', 0) . pack('N*', $counter);
        $hash = hash_hmac('sha1', $binaryCounter, totp_base32_decode($secret), true);
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF);
        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }
}

if (!function_exists('totp_verify')) {
    function totp_verify(string $secret, string $code, int $window = 1): bool
    {
        $code = preg_replace('/\D+/', '', $code);
        if (strlen($code) !== 6) {
            return false;
        }
        for ($i = -$window; $i <= $window; $i++) {
            if (hash_equals(totp_code($secret, time() + ($i * 30)), $code)) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('security_encryption_key')) {
    function security_encryption_key(): string
    {
        $configured = (string) app_env('APP_ENCRYPTION_KEY', '');
        if ($configured === '') {
            $configured = (string) app_config('jwt_secret', 'change_this_secret');
            error_log('[AI_CHAT_SAAS_SECURITY] APP_ENCRYPTION_KEY is missing; JWT_SECRET fallback is used.');
        }
        return hash('sha256', $configured, true);
    }
}

if (!function_exists('security_encrypt_secret')) {
    function security_encrypt_secret(string $plain): string
    {
        if (!function_exists('openssl_encrypt')) {
            throw new RuntimeException('OpenSSL extension is required for two-factor authentication.');
        }
        $nonce = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', security_encryption_key(), OPENSSL_RAW_DATA, $nonce, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Failed to encrypt two-factor secret.');
        }
        return base64_encode($nonce . $tag . $cipher);
    }
}

if (!function_exists('security_decrypt_secret')) {
    function security_decrypt_secret(string $encoded): string
    {
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 29) {
            return '';
        }
        $nonce = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', security_encryption_key(), OPENSSL_RAW_DATA, $nonce, $tag);
        return $plain === false ? '' : $plain;
    }
}

if (!function_exists('totp_recovery_codes')) {
    function totp_recovery_codes(int $count = 8): array
    {
        $codes = [];
        for ($i = 0; $i < $count; $i++) {
            $codes[] = strtoupper(bin2hex(random_bytes(4)));
        }
        return $codes;
    }
}
