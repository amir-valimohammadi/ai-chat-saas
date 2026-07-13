<?php

// مسیر فایل: ai-chat-saas/backend/includes/jwt.php
// هدف: ساخت و بررسی امن JWT بدون نیاز به کتابخانه خارجی

require_once __DIR__ . '/../config/app.php';

if (!function_exists('base64url_encode')) {
    function base64url_encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}

if (!function_exists('base64url_decode')) {
    function base64url_decode(string $data): ?string
    {
        if ($data === '' || !preg_match('/^[A-Za-z0-9\-_]*$/', $data)) {
            return null;
        }

        $remainder = strlen($data) % 4;

        if ($remainder > 0) {
            $data .= str_repeat('=', 4 - $remainder);
        }

        $decoded = base64_decode(strtr($data, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}

if (!function_exists('jwt_secret')) {
    function jwt_secret(): string
    {
        $secret = (string) app_config('jwt_secret', '');

        $isWeakSecret =
            $secret === '' ||
            $secret === 'change_this_secret' ||
            strlen($secret) < 32;

        if ($isWeakSecret) {
            error_log('[AI_CHAT_SAAS_SECURITY] JWT_SECRET is weak or missing.');

            if (app_is_production()) {
                throw new RuntimeException('JWT secret is not configured securely.');
            }
        }

        return $secret !== '' ? $secret : 'change_this_secret';
    }
}

if (!function_exists('jwt_encode')) {
    function jwt_encode(array $payload): string
    {
        $now = time();

        $header = [
            'typ' => 'JWT',
            'alg' => 'HS256',
        ];

        if (!isset($payload['iat'])) {
            $payload['iat'] = $now;
        }

        if (!isset($payload['nbf'])) {
            $payload['nbf'] = $now - 5;
        }

        if (!isset($payload['jti'])) {
            $payload['jti'] = bin2hex(random_bytes(16));
        }

        if (!isset($payload['iss'])) {
            $payload['iss'] = (string) app_config('jwt_issuer', 'ai-chat-saas');
        }

        if (!isset($payload['aud'])) {
            $payload['aud'] = (string) app_config('jwt_audience', 'ai-chat-saas-panel');
        }

        $encodedHeader = base64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES));
        $encodedPayload = base64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $signature = hash_hmac(
            'sha256',
            $encodedHeader . '.' . $encodedPayload,
            jwt_secret(),
            true
        );

        return $encodedHeader . '.' . $encodedPayload . '.' . base64url_encode($signature);
    }
}

if (!function_exists('jwt_decode')) {
    function jwt_decode(string $token): ?array
    {
        $token = trim($token);

        if ($token === '' || strlen($token) > 4096) {
            return null;
        }

        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;

        if ($encodedHeader === '' || $encodedPayload === '' || $encodedSignature === '') {
            return null;
        }

        $headerJson = base64url_decode($encodedHeader);
        $payloadJson = base64url_decode($encodedPayload);

        if ($headerJson === null || $payloadJson === null) {
            return null;
        }

        $header = json_decode($headerJson, true);
        $payload = json_decode($payloadJson, true);

        if (!is_array($header) || !is_array($payload)) {
            return null;
        }

        if (($header['typ'] ?? '') !== 'JWT') {
            return null;
        }

        if (($header['alg'] ?? '') !== 'HS256') {
            return null;
        }

        $expectedSignature = base64url_encode(
            hash_hmac(
                'sha256',
                $encodedHeader . '.' . $encodedPayload,
                jwt_secret(),
                true
            )
        );

        if (!hash_equals($expectedSignature, $encodedSignature)) {
            return null;
        }

        $now = time();
        $clockSkewSeconds = 60;

        if (!isset($payload['exp'], $payload['iat'], $payload['jti'])) {
            return null;
        }

        $exp = (int) $payload['exp'];
        $iat = (int) $payload['iat'];
        $nbf = isset($payload['nbf']) ? (int) $payload['nbf'] : null;

        if ($exp <= 0 || $iat <= 0 || $exp <= $iat) {
            return null;
        }

        if ($now > ($exp + $clockSkewSeconds)) {
            return null;
        }

        if ($nbf !== null && $now < ($nbf - $clockSkewSeconds)) {
            return null;
        }

        if ($iat > ($now + $clockSkewSeconds)) {
            return null;
        }

        $maxTtl = (int) app_config('jwt_max_ttl_seconds', 604800);

        if ($maxTtl > 0 && ($exp - $iat) > $maxTtl) {
            return null;
        }

        if (!is_string($payload['jti']) || strlen($payload['jti']) < 16 || strlen($payload['jti']) > 128) {
            return null;
        }

        $expectedIssuer = (string) app_config('jwt_issuer', 'ai-chat-saas');

        if ($expectedIssuer !== '' && ($payload['iss'] ?? '') !== $expectedIssuer) {
            return null;
        }

        $expectedAudience = (string) app_config('jwt_audience', 'ai-chat-saas-panel');

        if ($expectedAudience !== '' && ($payload['aud'] ?? '') !== $expectedAudience) {
            return null;
        }

        return $payload;
    }
}