<?php

// مسیر فایل: backend/api/system/heartbeat.php
// هدف: دریافت Heartbeat امن از Cron/Task Scheduler یا Workerها

require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$expectedSecret = trim((string) app_env('SYSTEM_HEARTBEAT_SECRET', ''));
$providedSecret = trim((string) ($_SERVER['HTTP_X_SYSTEM_HEARTBEAT'] ?? ''));

if ($expectedSecret === '' || !hash_equals($expectedSecret, $providedSecret)) {
    json_response(['success' => false, 'message' => 'Invalid heartbeat credentials'], 401);
}

$raw = file_get_contents('php://input');
$input = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($input)) {
    $input = [];
}

$serviceKey = preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) ($input['service_key'] ?? 'scheduler')));
$serviceLabel = trim((string) ($input['service_label'] ?? 'Cron / Task Scheduler'));
$status = (string) ($input['status'] ?? 'healthy');
$message = trim((string) ($input['message'] ?? 'Heartbeat دریافت شد.'));
$metadata = $input['metadata'] ?? null;

if ($serviceKey === '' || strlen($serviceKey) > 100 || !in_array($status, ['healthy', 'degraded', 'down', 'idle'], true)) {
    json_response(['success' => false, 'message' => 'Invalid heartbeat payload'], 422);
}

$metadataJson = $metadata !== null
    ? json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    : null;

$stmt = $pdo->prepare("
    INSERT INTO system_service_heartbeats (
        service_key, service_label, status, message, metadata_json, last_seen_at
    ) VALUES (
        :service_key, :service_label, :status, :message, :metadata_json, NOW()
    )
    ON DUPLICATE KEY UPDATE
        service_label = VALUES(service_label), status = VALUES(status),
        message = VALUES(message), metadata_json = VALUES(metadata_json),
        last_seen_at = NOW(), updated_at = NOW()
");
$stmt->execute([
    ':service_key' => $serviceKey,
    ':service_label' => mb_substr($serviceLabel ?: $serviceKey, 0, 190),
    ':status' => $status,
    ':message' => $message !== '' ? mb_substr($message, 0, 500) : null,
    ':metadata_json' => $metadataJson,
]);

json_response(['success' => true, 'message' => 'Heartbeat registered', 'service_key' => $serviceKey]);
