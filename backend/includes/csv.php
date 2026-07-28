<?php

// مسیر فایل: backend/includes/csv.php
// هدف: خروجی CSV سازگار با PHP 8.4 و مقاوم در برابر Formula Injection

if (!function_exists('csv_safe_cell')) {
    function csv_safe_cell(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (!is_scalar($value)) {
            $value = json_encode(
                $value,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
            );
        }

        $text = (string) $value;
        if (preg_match('/^[=+\-@]/u', ltrim($text))) {
            return "'" . $text;
        }

        return $text;
    }
}

if (!function_exists('csv_write_row')) {
    /** @param resource $stream */
    function csv_write_row($stream, array $row): void
    {
        $result = fputcsv(
            $stream,
            array_map('csv_safe_cell', $row),
            ',',
            '"',
            ''
        );

        if ($result === false) {
            throw new RuntimeException('CSV row could not be written.');
        }
    }
}
