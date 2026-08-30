<?php

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/automation.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['success' => false, 'message' => 'Method not allowed'], 405);
$user = require_auth($pdo);
require_role($user, ['customer_admin']);
$input = get_json_input();
$conversationId = max(0, (int) ($input['conversation_id'] ?? 0));
if ($conversationId <= 0) json_response(['success' => false, 'message' => 'یک گفتگو برای آزمایش انتخاب کنید.'], 422);

try {
    $result = automation_preview_rule($pdo, (int) $user['tenant_id'], $conversationId, $input);
    json_response(['success' => true, 'preview' => $result]);
} catch (InvalidArgumentException $e) {
    json_response(['success' => false, 'message' => $e->getMessage()], 422);
} catch (Throwable $e) {
    safe_api_exception_context($e);
    json_response(['success' => false, 'message' => 'آزمایش قانون ناموفق بود.'], 500);
}

