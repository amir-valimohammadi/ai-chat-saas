<?php

// مسیر فایل: backend/api/public/plans-list.php
// هدف: نمایش عمومی پلن‌های فعال برای فرم مشاوره و خرید

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

try {
    $stmt = $pdo->query("\n        SELECT\n            id, name, description, max_sites, max_agents,\n            max_monthly_conversations, ai_suggestions_enabled,\n            ai_auto_reply_enabled, knowledge_base_enabled, price_monthly\n        FROM plans\n        WHERE is_active = 1\n        ORDER BY price_monthly ASC, id ASC\n    ");

    $plans = array_map(static function (array $plan): array {
        return [
            'id' => (int) $plan['id'],
            'name' => $plan['name'],
            'description' => $plan['description'],
            'max_sites' => (int) $plan['max_sites'],
            'max_agents' => (int) $plan['max_agents'],
            'max_monthly_conversations' => (int) $plan['max_monthly_conversations'],
            'ai_suggestions_enabled' => (bool) $plan['ai_suggestions_enabled'],
            'ai_auto_reply_enabled' => (bool) $plan['ai_auto_reply_enabled'],
            'knowledge_base_enabled' => (bool) $plan['knowledge_base_enabled'],
            'price_monthly' => (float) $plan['price_monthly'],
        ];
    }, $stmt->fetchAll());

    json_response([
        'success' => true,
        'plans' => $plans,
    ]);
} catch (Throwable $e) {
    error_log('[PUBLIC_PLANS_LIST] ' . $e->getMessage());

    json_response([
        'success' => false,
        'message' => 'دریافت پلن‌ها در حال حاضر ممکن نیست.',
    ], 500);
}
