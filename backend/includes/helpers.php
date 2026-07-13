<?php

// مسیر فایل: backend/includes/helpers.php

function get_json_input(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    return is_array($data) ? $data : [];
}

function random_site_key(): string
{
    return bin2hex(random_bytes(24));
}
