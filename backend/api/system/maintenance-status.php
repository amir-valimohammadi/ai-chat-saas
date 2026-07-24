<?php

// مسیر فایل: backend/api/system/maintenance-status.php
// هدف: اعلام عمومی و سبک وضعیت Maintenance Mode برای پنل مشتری

require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/maintenance.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$state = maintenance_mode_state($pdo);

json_response([
    'success' => true,
    'maintenance' => [
        'enabled' => $state['enabled'],
        'message' => $state['message'],
        'until' => $state['until'],
    ],
]);
