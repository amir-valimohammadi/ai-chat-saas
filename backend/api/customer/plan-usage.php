<?php

// مسیر فایل: ai-chat-saas/backend/api/customer/plan-usage.php
// هدف: نمایش پلن فعلی مشتری و میزان مصرف محدودیت‌ها

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin']);

$tenantId = (int) $user['tenant_id'];

try {
    $tenantStmt = $pdo->prepare("
        SELECT
            tenants.id,
            tenants.name,
            tenants.status,
            tenants.plan_id,
            plans.name AS plan_name,
            plans.description AS plan_description,
            plans.max_sites,
            plans.max_agents,
            plans.max_monthly_conversations,
            plans.ai_suggestions_enabled,
            plans.ai_auto_reply_enabled,
            plans.knowledge_base_enabled,
            plans.price_monthly,
            plans.is_active AS plan_is_active
        FROM tenants
        LEFT JOIN plans ON plans.id = tenants.plan_id
        WHERE tenants.id = :tenant_id
        LIMIT 1
    ");

    $tenantStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $tenant = $tenantStmt->fetch();

    if (!$tenant) {
        json_response([
            'success' => false,
            'message' => 'Customer not found'
        ], 404);
    }

    $sitesStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM sites
        WHERE tenant_id = :tenant_id
    ");

    $sitesStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $sitesData = $sitesStmt->fetch();

    $agentsStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM users
        WHERE tenant_id = :tenant_id
          AND role = 'agent'
          AND is_active = 1
    ");

    $agentsStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $agentsData = $agentsStmt->fetch();

    $monthlyConversationsStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
          AND conversations.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
          AND conversations.created_at < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'), INTERVAL 1 MONTH)
    ");

    $monthlyConversationsStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $monthlyConversationsData = $monthlyConversationsStmt->fetch();

    $knowledgeItemsStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM knowledge_sources
        INNER JOIN sites ON sites.id = knowledge_sources.site_id
        WHERE sites.tenant_id = :tenant_id
          AND knowledge_sources.status != 'archived'
    ");

    $knowledgeItemsStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $knowledgeItemsData = $knowledgeItemsStmt->fetch();

    $aiSuggestionsStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM ai_suggestions
        INNER JOIN conversations ON conversations.id = ai_suggestions.conversation_id
        INNER JOIN sites ON sites.id = conversations.site_id
        WHERE sites.tenant_id = :tenant_id
          AND ai_suggestions.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
          AND ai_suggestions.created_at < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'), INTERVAL 1 MONTH)
    ");

    $aiSuggestionsStmt->execute([
        ':tenant_id' => $tenantId,
    ]);

    $aiSuggestionsData = $aiSuggestionsStmt->fetch();

    $maxSites = (int) ($tenant['max_sites'] ?? 0);
    $maxAgents = (int) ($tenant['max_agents'] ?? 0);
    $maxMonthlyConversations = (int) ($tenant['max_monthly_conversations'] ?? 0);

    $usedSites = (int) ($sitesData['total'] ?? 0);
    $usedAgents = (int) ($agentsData['total'] ?? 0);
    $usedMonthlyConversations = (int) ($monthlyConversationsData['total'] ?? 0);

    json_response([
        'success' => true,
        'customer' => [
            'id' => (int) $tenant['id'],
            'name' => $tenant['name'],
            'status' => $tenant['status'],
        ],
        'plan' => [
            'id' => $tenant['plan_id'] !== null ? (int) $tenant['plan_id'] : null,
            'name' => $tenant['plan_name'],
            'description' => $tenant['plan_description'],
            'price_monthly' => $tenant['price_monthly'] !== null ? (float) $tenant['price_monthly'] : 0,
            'is_active' => (bool) ($tenant['plan_is_active'] ?? false),
            'limits' => [
                'max_sites' => $maxSites,
                'max_agents' => $maxAgents,
                'max_monthly_conversations' => $maxMonthlyConversations,
            ],
            'features' => [
                'knowledge_base_enabled' => (bool) ($tenant['knowledge_base_enabled'] ?? false),
                'ai_suggestions_enabled' => (bool) ($tenant['ai_suggestions_enabled'] ?? false),
                'ai_auto_reply_enabled' => (bool) ($tenant['ai_auto_reply_enabled'] ?? false),
            ],
        ],
        'usage' => [
            'sites' => [
                'used' => $usedSites,
                'limit' => $maxSites,
                'remaining' => max($maxSites - $usedSites, 0),
                'percent' => $maxSites > 0 ? min(round(($usedSites / $maxSites) * 100), 100) : 0,
            ],
            'agents' => [
                'used' => $usedAgents,
                'limit' => $maxAgents,
                'remaining' => max($maxAgents - $usedAgents, 0),
                'percent' => $maxAgents > 0 ? min(round(($usedAgents / $maxAgents) * 100), 100) : 0,
            ],
            'monthly_conversations' => [
                'used' => $usedMonthlyConversations,
                'limit' => $maxMonthlyConversations,
                'remaining' => max($maxMonthlyConversations - $usedMonthlyConversations, 0),
                'percent' => $maxMonthlyConversations > 0 ? min(round(($usedMonthlyConversations / $maxMonthlyConversations) * 100), 100) : 0,
            ],
            'knowledge_items' => [
                'used' => (int) ($knowledgeItemsData['total'] ?? 0),
            ],
            'ai_suggestions_this_month' => [
                'used' => (int) ($aiSuggestionsData['total'] ?? 0),
            ],
        ],
        'period' => [
            'month_start' => date('Y-m-01 00:00:00'),
            'now' => date('Y-m-d H:i:s'),
        ],
    ]);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to load plan usage',
        'error' => $e->getMessage()
    ], 500);
}