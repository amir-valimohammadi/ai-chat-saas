<?php

// مسیر فایل: ai-chat-saas/backend/includes/knowledge-search.php
// هدف: جستجوی ساده در knowledge_sources برای ساخت پیشنهاد پاسخ

function normalize_knowledge_text(string $text): string
{
    $text = mb_strtolower($text, 'UTF-8');

    $replacements = [
        'ي' => 'ی',
        'ك' => 'ک',
        'ۀ' => 'ه',
        'ة' => 'ه',
        'أ' => 'ا',
        'إ' => 'ا',
        'آ' => 'ا',
    ];

    $text = strtr($text, $replacements);
    $text = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $text);
    $text = preg_replace('/\s+/u', ' ', $text);

    return trim($text);
}

function tokenize_knowledge_text(string $text): array
{
    $normalized = normalize_knowledge_text($text);

    if ($normalized === '') {
        return [];
    }

    $tokens = preg_split('/\s+/u', $normalized);

    $stopWords = [
        'از', 'به', 'با', 'در', 'را', 'که', 'این', 'آن', 'برای', 'یا', 'و',
        'های', 'ها', 'است', 'هست', 'می', 'شود', 'شد', 'چطور', 'چگونه',
        'the', 'a', 'an', 'is', 'are', 'to', 'for', 'of', 'and'
    ];

    $tokens = array_filter($tokens, function ($token) use ($stopWords) {
        return mb_strlen($token, 'UTF-8') >= 2 && !in_array($token, $stopWords, true);
    });

    return array_values(array_unique($tokens));
}

function score_knowledge_match(string $userMessage, array $source): float
{
    $messageTokens = tokenize_knowledge_text($userMessage);

    if (count($messageTokens) === 0) {
        return 0.0;
    }

    $sourceText = implode(' ', array_filter([
        $source['title'] ?? '',
        $source['question'] ?? '',
        $source['answer'] ?? '',
        $source['content'] ?? '',
    ]));

    $sourceTokens = tokenize_knowledge_text($sourceText);

    if (count($sourceTokens) === 0) {
        return 0.0;
    }

    $matches = array_intersect($messageTokens, $sourceTokens);
    $matchCount = count($matches);

    if ($matchCount === 0) {
        return 0.0;
    }

    $baseScore = $matchCount / max(count($messageTokens), 1);

    if (!empty($source['question'])) {
        $questionTokens = tokenize_knowledge_text($source['question']);
        $questionMatches = array_intersect($messageTokens, $questionTokens);

        if (count($questionMatches) > 0) {
            $baseScore += 0.25;
        }
    }

    return min(1.0, $baseScore);
}

function find_relevant_knowledge(PDO $pdo, int $siteId, string $userMessage, int $limit = 5): array
{
    $stmt = $pdo->prepare("
        SELECT
            id,
            site_id,
            type,
            title,
            question,
            answer,
            content,
            url,
            status,
            created_at,
            updated_at
        FROM knowledge_sources
        WHERE site_id = :site_id
          AND status = 'approved'
        ORDER BY id DESC
        LIMIT 200
    ");

    $stmt->execute([
        ':site_id' => $siteId,
    ]);

    $sources = $stmt->fetchAll();

    $scored = [];

    foreach ($sources as $source) {
        $score = score_knowledge_match($userMessage, $source);

        if ($score > 0) {
            $source['score'] = $score;
            $scored[] = $source;
        }
    }

    usort($scored, function ($a, $b) {
        return $b['score'] <=> $a['score'];
    });

    return array_slice($scored, 0, $limit);
}

function build_suggested_reply_from_knowledge(string $userMessage, array $sources): array
{
    if (count($sources) === 0) {
        return [
            'reply' => 'برای پاسخ دقیق‌تر، لطفاً این گفتگو را بررسی کنید یا اطلاعات بیشتری از کاربر بگیرید.',
            'confidence' => 0.20,
            'sources' => [],
        ];
    }

    $best = $sources[0];

    $answer = trim((string) ($best['answer'] ?? ''));

    if ($answer === '') {
        $answer = trim((string) ($best['content'] ?? ''));
    }

    if ($answer === '') {
        $answer = trim((string) ($best['title'] ?? ''));
    }

    $answer = mb_substr($answer, 0, 900, 'UTF-8');

    $reply = $answer;

    if (!str_contains($reply, 'اگر')) {
        $reply .= "\n\nاگر سؤال دیگری دارید، خوشحال می‌شویم راهنمایی‌تان کنیم.";
    }

    $confidence = max(0.35, min(0.92, (float) $best['score']));

    $sourcesForJson = array_map(function ($source) {
        return [
            'id' => (int) $source['id'],
            'type' => $source['type'],
            'title' => $source['title'],
            'question' => $source['question'],
            'score' => round((float) $source['score'], 3),
        ];
    }, $sources);

    return [
        'reply' => $reply,
        'confidence' => $confidence,
        'sources' => $sourcesForJson,
    ];
}