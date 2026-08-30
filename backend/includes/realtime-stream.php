<?php

// Shared helpers for short-lived Server-Sent Events streams.

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';

if (!function_exists('realtime_stream_duration_seconds')) {
    function realtime_stream_duration_seconds(): int
    {
        return max(10, min(55, (int) app_env('REALTIME_STREAM_DURATION_SECONDS', 25)));
    }
}

if (!function_exists('realtime_stream_poll_interval_microseconds')) {
    function realtime_stream_poll_interval_microseconds(): int
    {
        $milliseconds = max(250, min(3000, (int) app_env('REALTIME_POLL_INTERVAL_MS', 750)));
        return $milliseconds * 1000;
    }
}

if (!function_exists('realtime_stream_prepare')) {
    function realtime_stream_prepare(): void
    {
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', '0');
        @set_time_limit(realtime_stream_duration_seconds() + 10);
        @ob_implicit_flush(true);

        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
            @apache_setenv('dont-vary', '1');
        }

        while (ob_get_level() > 0) {
            @ob_end_flush();
        }

        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Accel-Buffering: no');
        header('Connection: keep-alive');

        // Apache on Windows may retain small chunks until its internal buffer fills.
        // A comment frame is ignored by SSE clients but forces the headers and first
        // actual event onto the wire immediately.
        echo ':' . str_repeat(' ', 4096) . "\n\n";
        @flush();
    }
}

if (!function_exists('realtime_stream_event')) {
    function realtime_stream_event(string $event, array $data, ?string $id = null): void
    {
        if ($id !== null && $id !== '') {
            echo 'id: ' . str_replace(["\r", "\n"], '', $id) . "\n";
        }

        echo 'event: ' . preg_replace('/[^A-Za-z0-9_.-]/', '', $event) . "\n";
        echo 'data: ' . json_encode(
            $data,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        ) . "\n\n";

        @flush();
    }
}

if (!function_exists('realtime_stream_heartbeat')) {
    function realtime_stream_heartbeat(): void
    {
        echo ': heartbeat ' . time() . "\n\n";
        @flush();
    }
}

if (!function_exists('realtime_stream_is_disconnected')) {
    function realtime_stream_is_disconnected(): bool
    {
        return connection_aborted() === 1;
    }
}

if (!function_exists('realtime_stream_fingerprint')) {
    function realtime_stream_fingerprint(array $state): string
    {
        return hash('sha256', json_encode(
            $state,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        ) ?: '');
    }
}
