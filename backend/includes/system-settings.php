<?php

// مسیر فایل: backend/includes/system-settings.php
// هدف: خواندن و نوشتن امن تنظیمات مرکزی سیستم

if (!function_exists('system_setting_get')) {
    function system_setting_get(PDO $pdo, string $key, mixed $default = null): mixed
    {
        try {
            $stmt = $pdo->prepare("SELECT setting_value, value_type FROM system_settings WHERE setting_key = :setting_key LIMIT 1");
            $stmt->execute([':setting_key' => $key]);
            $row = $stmt->fetch();

            if (!$row) {
                return $default;
            }

            $value = $row['setting_value'];

            return match ($row['value_type']) {
                'boolean' => in_array(strtolower((string) $value), ['1', 'true', 'yes', 'on'], true),
                'integer' => (int) $value,
                'json' => is_string($value) ? (json_decode($value, true) ?? $default) : $default,
                default => $value,
            };
        } catch (Throwable) {
            // پیش از اجرای Migration، نبود جدول نباید APIهای موجود را از کار بیندازد.
            return $default;
        }
    }
}

if (!function_exists('system_setting_set')) {
    function system_setting_set(
        PDO $pdo,
        string $key,
        mixed $value,
        string $valueType = 'string',
        ?int $updatedBy = null
    ): void {
        $allowedTypes = ['string', 'boolean', 'integer', 'json', 'datetime'];

        if (!in_array($valueType, $allowedTypes, true)) {
            throw new InvalidArgumentException('Invalid system setting value type');
        }

        if ($valueType === 'boolean') {
            $storedValue = $value ? '1' : '0';
        } elseif ($valueType === 'json') {
            $storedValue = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($storedValue === false) {
                throw new RuntimeException('Failed to encode system setting JSON');
            }
        } elseif ($value === null) {
            $storedValue = null;
        } else {
            $storedValue = (string) $value;
        }

        $stmt = $pdo->prepare("
            INSERT INTO system_settings (
                setting_key, setting_value, value_type, updated_by, created_at, updated_at
            ) VALUES (
                :setting_key, :setting_value, :value_type, :updated_by, NOW(), NOW()
            )
            ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                value_type = VALUES(value_type),
                updated_by = VALUES(updated_by),
                updated_at = NOW()
        ");
        $stmt->execute([
            ':setting_key' => $key,
            ':setting_value' => $storedValue,
            ':value_type' => $valueType,
            ':updated_by' => $updatedBy,
        ]);
    }
}
