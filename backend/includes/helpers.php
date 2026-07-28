<?php

// مسیر فایل: backend/includes/helpers.php

function get_json_input(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $trimmed = ltrim($raw);
    if ($trimmed === '' || $trimmed[0] !== '{') {
        if (function_exists('json_response')) {
            json_response([
                'success' => false,
                'message' => 'JSON request body must be an object',
            ], 400);
        }

        throw new InvalidArgumentException('JSON request body must be an object');
    }

    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        if (function_exists('json_response')) {
            json_response([
                'success' => false,
                'message' => 'Invalid JSON request body',
            ], 400);
        }

        throw new InvalidArgumentException('Invalid JSON request body', 0, $exception);
    }

    if (!is_array($data)) {
        if (function_exists('json_response')) {
            json_response([
                'success' => false,
                'message' => 'JSON request body must be an object',
            ], 400);
        }

        throw new InvalidArgumentException('JSON request body must be an object');
    }

    return $data;
}

function random_site_key(): string
{
    return bin2hex(random_bytes(24));
}
