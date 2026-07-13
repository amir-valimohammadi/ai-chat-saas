<?php

// مسیر فایل: ai-chat-saas/backend/includes/ai-answer-engine.php
// هدف: جستجو در دانش ذخیره‌شده AI و ساخت پاسخ استخراجی بدون API خارجی

require_once __DIR__ . '/ai-crawler.php';

if (!function_exists('ai_question_tokens')) {
    function ai_question_tokens(string $text): array
    {
        $text = mb_strtolower(ai_normalize_text($text));
        $text = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $text);
        $parts = preg_split('/\s+/u', trim((string) $text)) ?: [];

        $stopWords = [
            'سلام', 'لطفا', 'لطفاً', 'میشه', 'می‌شه', 'میتونم', 'می‌توانم', 'ایا', 'آیا',
            'این', 'اون', 'آن', 'برای', 'با', 'به', 'از', 'در', 'را', 'که', 'یک', 'یا',
            'است', 'هست', 'شد', 'شود', 'کرد', 'کنم', 'کنید', 'چیه', 'چیست', 'چطور',
            'چگونه', 'چقدر', 'چند', 'من', 'شما', 'ما',
            'the', 'and', 'or', 'for', 'with', 'this', 'that', 'you', 'your', 'is', 'are'
        ];

        $tokens = [];

        foreach ($parts as $part) {
            $part = trim($part);

            if (mb_strlen($part) < 2) {
                continue;
            }

            if (in_array($part, $stopWords, true)) {
                continue;
            }

            $tokens[] = $part;
        }

        return array_values(array_unique(array_slice($tokens, 0, 12)));
    }
}

if (!function_exists('ai_detect_question_intent')) {
    function ai_detect_question_intent(string $question): array
    {
        $q = mb_strtolower(ai_normalize_text($question));

        $rules = [
            [
                'category' => 'قیمت / تعرفه',
                'intent' => 'pricing',
                'keywords' => ['قیمت', 'هزینه', 'تعرفه', 'مبلغ', 'پرداخت', 'چقدر', 'price', 'cost']
            ],
            [
                'category' => 'تماس و مراجعه',
                'intent' => 'contact',
                'keywords' => ['تماس', 'آدرس', 'ادرس', 'تلفن', 'لوکیشن', 'کجا', 'location', 'contact']
            ],
            [
                'category' => 'نوبت‌دهی',
                'intent' => 'appointment',
                'keywords' => ['نوبت', 'رزرو', 'وقت', 'مشاوره', 'booking', 'appointment']
            ],
            [
                'category' => 'ارسال و تحویل',
                'intent' => 'shipping',
                'keywords' => ['ارسال', 'تحویل', 'پست', 'مرسوله', 'delivery', 'shipping']
            ],
            [
                'category' => 'سوالات متداول',
                'intent' => 'faq',
                'keywords' => ['سوال', 'پرسش', 'faq']
            ],
            [
                'category' => 'خدمات',
                'intent' => 'service_info',
                'keywords' => ['خدمات', 'سرویس', 'محصول', 'درمان', 'جراحی', 'service']
            ],
        ];

        foreach ($rules as $rule) {
            foreach ($rule['keywords'] as $keyword) {
                if (mb_strpos($q, mb_strtolower($keyword)) !== false) {
                    return [
                        'category' => $rule['category'],
                        'intent' => $rule['intent']
                    ];
                }
            }
        }

        return [
            'category' => null,
            'intent' => 'general_info'
        ];
    }
}

if (!function_exists('ai_text_match_score')) {
    function ai_text_match_score(array $tokens, string $text, string $originalQuestion = ''): float
    {
        $text = mb_strtolower(ai_normalize_text($text));
        $originalQuestion = mb_strtolower(ai_normalize_text($originalQuestion));

        if (!$tokens || $text === '') {
            return 0.00;
        }

        $matched = 0;
        $weighted = 0;

        foreach ($tokens as $token) {
            if (mb_strpos($text, $token) !== false) {
                $matched++;
                $weighted += mb_strlen($token) >= 4 ? 1.25 : 1.00;
            }
        }

        $ratio = $matched / max(1, count($tokens));
        $score = $ratio * 60;

        $score += min(25, $weighted * 4);

        if ($originalQuestion !== '' && mb_strlen($originalQuestion) >= 8) {
            if (mb_strpos($text, $originalQuestion) !== false) {
                $score += 20;
            }
        }

        return min(100, round($score, 2));
    }
}

if (!function_exists('ai_build_excerpt_reply')) {
    function ai_build_excerpt_reply(string $text, array $tokens = [], string $question = '', int $maxLength = 420): string
    {
        $text = ai_normalize_text($text);
        $text = preg_replace('/\s+/u', ' ', $text);
        $text = trim((string) $text);

        if ($text === '') {
            return 'برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم.';
        }

        $sentences = preg_split('/(?<=[.!؟?])\s+/u', $text) ?: [];

        $scoredSentences = [];

        foreach ($sentences as $sentence) {
            $sentence = trim($sentence);

            if ($sentence === '') {
                continue;
            }

            $score = ai_text_match_score($tokens, $sentence, $question);

            $scoredSentences[] = [
                'sentence' => $sentence,
                'score' => $score
            ];
        }

        usort($scoredSentences, function ($a, $b) {
            return $b['score'] <=> $a['score'];
        });

        $selected = [];

        foreach ($scoredSentences as $item) {
            if ($item['score'] <= 0 && count($selected) > 0) {
                continue;
            }

            $selected[] = $item['sentence'];

            if (count($selected) >= 2) {
                break;
            }
        }

        if (!$selected) {
            $selected[] = mb_substr($text, 0, $maxLength);
        }

        $reply = trim(implode(' ', $selected));

        if (mb_strlen($reply) > $maxLength) {
            $reply = mb_substr($reply, 0, $maxLength) . '...';
        }

        return 'طبق اطلاعات سایت: ' . $reply;
    }
}

if (!function_exists('ai_load_term_boosts')) {
    function ai_load_term_boosts(PDO $pdo, int $tenantId, int $siteId, array $chunkIds, array $tokens): array
    {
        $chunkIds = array_values(array_unique(array_filter(array_map('intval', $chunkIds))));
        $tokens = array_values(array_unique(array_filter($tokens)));

        if (!$chunkIds || !$tokens) {
            return [];
        }

        $chunkPlaceholders = [];
        $tokenPlaceholders = [];
        $params = [
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
        ];

        foreach ($chunkIds as $i => $chunkId) {
            $key = ':chunk_' . $i;
            $chunkPlaceholders[] = $key;
            $params[$key] = $chunkId;
        }

        foreach ($tokens as $i => $token) {
            $key = ':token_' . $i;
            $tokenPlaceholders[] = $key;
            $params[$key] = $token;
        }

        $sql = "
            SELECT chunk_id, SUM(score) AS total_score
            FROM ai_terms
            WHERE tenant_id = :tenant_id
              AND site_id = :site_id
              AND chunk_id IN (" . implode(',', $chunkPlaceholders) . ")
              AND normalized_term IN (" . implode(',', $tokenPlaceholders) . ")
            GROUP BY chunk_id
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $boosts = [];

        while ($row = $stmt->fetch()) {
            $chunkId = (int) $row['chunk_id'];
            $boosts[$chunkId] = min(20, ((float) $row['total_score']) / 10);
        }

        return $boosts;
    }
}

if (!function_exists('ai_search_chunk_candidates')) {
    function ai_search_chunk_candidates(PDO $pdo, int $tenantId, int $siteId, array $tokens): array
    {
        if (!$tokens) {
            return [];
        }

        $conditions = [];
        $params = [
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
        ];

        foreach ($tokens as $i => $token) {
            $conditions[] = "(
                c.chunk_text LIKE :chunk_text_{$i}
                OR c.normalized_text LIKE :normalized_text_{$i}
                OR c.heading LIKE :heading_{$i}
                OR p.title LIKE :page_title_{$i}
                OR p.main_heading LIKE :page_heading_{$i}
            )";

            $like = '%' . $token . '%';

            $params[":chunk_text_{$i}"] = $like;
            $params[":normalized_text_{$i}"] = $like;
            $params[":heading_{$i}"] = $like;
            $params[":page_title_{$i}"] = $like;
            $params[":page_heading_{$i}"] = $like;
        }

        $sql = "
            SELECT
                c.id AS chunk_id,
                c.page_id,
                c.heading,
                c.chunk_text,
                c.normalized_text,
                c.category,
                c.detected_intent,
                c.importance_score,
                p.url,
                p.title,
                p.main_heading
            FROM ai_content_chunks c
            INNER JOIN ai_pages p ON p.id = c.page_id
            WHERE c.tenant_id = :tenant_id
              AND c.site_id = :site_id
              AND c.status = 'active'
              AND (" . implode(' OR ', $conditions) . ")
            ORDER BY c.importance_score DESC, c.id DESC
            LIMIT 50
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}

if (!function_exists('ai_search_question_candidates')) {
    function ai_search_question_candidates(PDO $pdo, int $tenantId, int $siteId, array $tokens): array
    {
        if (!$tokens) {
            return [];
        }

        $conditions = [];
        $params = [
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
        ];

        foreach ($tokens as $i => $token) {
            $conditions[] = "(
                q.question LIKE :question_{$i}
                OR q.normalized_question LIKE :normalized_question_{$i}
                OR q.answer_text LIKE :answer_text_{$i}
            )";

            $like = '%' . $token . '%';

            $params[":question_{$i}"] = $like;
            $params[":normalized_question_{$i}"] = $like;
            $params[":answer_text_{$i}"] = $like;
        }

        $sql = "
            SELECT
                q.id AS question_id,
                q.page_id,
                q.chunk_id,
                q.question,
                q.normalized_question,
                q.answer_text,
                q.category,
                q.detected_intent,
                q.score,
                p.url,
                p.title,
                p.main_heading
            FROM ai_generated_questions q
            LEFT JOIN ai_pages p ON p.id = q.page_id
            WHERE q.tenant_id = :tenant_id
              AND q.site_id = :site_id
              AND q.status = 'active'
              AND (" . implode(' OR ', $conditions) . ")
            ORDER BY q.score DESC, q.id DESC
            LIMIT 50
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}
if (!function_exists('ai_search_legacy_knowledge_candidates')) {
    function ai_search_legacy_knowledge_candidates(PDO $pdo, int $siteId, array $tokens): array
    {
        if (!$tokens) {
            return [];
        }

        $conditions = [];
        $params = [
            ':site_id' => $siteId,
        ];

        foreach ($tokens as $i => $token) {
            $conditions[] = "(
                title LIKE :title_{$i}
                OR question LIKE :question_{$i}
                OR answer LIKE :answer_{$i}
                OR content LIKE :content_{$i}
                OR type LIKE :type_{$i}
            )";

            $like = '%' . $token . '%';

            $params[":title_{$i}"] = $like;
            $params[":question_{$i}"] = $like;
            $params[":answer_{$i}"] = $like;
            $params[":content_{$i}"] = $like;
            $params[":type_{$i}"] = $like;
        }

        $sql = "
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
              AND status IN ('approved', 'active')
              AND (" . implode(' OR ', $conditions) . ")
            ORDER BY id DESC
            LIMIT 50
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}
if (!function_exists('ai_find_best_answer')) {
    function ai_find_best_answer(PDO $pdo, array $site, string $question): array
    {
        $tenantId = (int) $site['tenant_id'];
        $siteId = (int) $site['id'];

        $question = ai_normalize_text($question);
        $tokens = ai_question_tokens($question);
        $detected = ai_detect_question_intent($question);

        if (mb_strlen($question) < 2 || !$tokens) {
            return [
                'success' => false,
                'reply_mode' => 'no_answer',
                'message' => 'Question is too short',
                'question' => $question,
                'tokens' => $tokens,
                'detected' => $detected,
                'confidence_score' => 0,
                'answer' => null,
                'sources' => [],
                'best_candidates' => []
            ];
        }

        $legacyKnowledgeCandidates = ai_search_legacy_knowledge_candidates($pdo, $siteId, $tokens);
        $chunkCandidates = ai_search_chunk_candidates($pdo, $tenantId, $siteId, $tokens);
        $questionCandidates = ai_search_question_candidates($pdo, $tenantId, $siteId, $tokens);

        $chunkIds = [];

        foreach ($chunkCandidates as $candidate) {
            $chunkIds[] = (int) $candidate['chunk_id'];
        }

        foreach ($questionCandidates as $candidate) {
            if (!empty($candidate['chunk_id'])) {
                $chunkIds[] = (int) $candidate['chunk_id'];
            }
        }

        $termBoosts = ai_load_term_boosts($pdo, $tenantId, $siteId, $chunkIds, $tokens);

        $scored = [];
        foreach ($legacyKnowledgeCandidates as $candidate) {
            $titleText = trim((string) ($candidate['title'] ?? ''));
            $questionText = trim((string) ($candidate['question'] ?? ''));
            $answerText = trim((string) ($candidate['answer'] ?? ''));
            $contentText = trim((string) ($candidate['content'] ?? ''));

            $finalAnswerText = $answerText !== '' ? $answerText : $contentText;

            if ($finalAnswerText === '') {
                continue;
            }

            $searchableQuestionText = trim(
                $titleText . ' ' .
                $questionText . ' ' .
                ($candidate['type'] ?? '')
            );

            $allText = trim($searchableQuestionText . ' ' . $finalAnswerText);

            $questionMatch = ai_text_match_score($tokens, $searchableQuestionText, $question);
            $answerMatch = ai_text_match_score($tokens, $finalAnswerText, $question);
            $allMatch = ai_text_match_score($tokens, $allText, $question);

            $score = ($questionMatch * 0.45) + ($answerMatch * 0.35) + ($allMatch * 0.20);

            // دانش دستی سایت باید نسبت به محتوای خام خزش‌شده اولویت بیشتری داشته باشد
            $score += 15;

            if (($candidate['status'] ?? '') === 'approved') {
                $score += 8;
            }

            if (($candidate['type'] ?? '') === 'faq') {
                $score += 5;
            }

            $normalizedQuestion = mb_strtolower(ai_normalize_text($question));
            $normalizedCandidateQuestion = mb_strtolower(ai_normalize_text($questionText . ' ' . $titleText));

            if ($normalizedQuestion !== '' && mb_strpos($normalizedCandidateQuestion, $normalizedQuestion) !== false) {
                $score += 18;
            }

            $scored[] = [
                'type' => 'knowledge_source',
                'score' => min(100, round($score, 2)),
                'knowledge_source_id' => (int) $candidate['id'],
                'question_id' => null,
                'chunk_id' => null,
                'page_id' => null,
                'answer_text' => $finalAnswerText,
                'matched_question' => $questionText ?: $titleText,
                'category' => 'دانش دستی سایت',
                'intent' => $candidate['type'] ?: 'manual_knowledge',
                'url' => $candidate['url'] ?? null,
                'title' => $titleText ?: $questionText ?: 'دانش دستی سایت',
            ];
        }

        foreach ($questionCandidates as $candidate) {
            $questionMatch = ai_text_match_score($tokens, $candidate['question'] ?? '', $question);
            $answerMatch = ai_text_match_score($tokens, $candidate['answer_text'] ?? '', $question);

            $score = ($questionMatch * 0.60) + ($answerMatch * 0.25);

            if ($detected['intent'] && $candidate['detected_intent'] === $detected['intent']) {
                $score += 12;
            }

            if ($detected['category'] && $candidate['category'] === $detected['category']) {
                $score += 8;
            }

            if (!empty($candidate['chunk_id']) && isset($termBoosts[(int) $candidate['chunk_id']])) {
                $score += $termBoosts[(int) $candidate['chunk_id']];
            }

            $score += min(8, ((float) $candidate['score']) / 10);

            $scored[] = [
                'type' => 'generated_question',
                'score' => min(100, round($score, 2)),
                'question_id' => (int) $candidate['question_id'],
                'chunk_id' => !empty($candidate['chunk_id']) ? (int) $candidate['chunk_id'] : null,
                'page_id' => !empty($candidate['page_id']) ? (int) $candidate['page_id'] : null,
                'answer_text' => $candidate['answer_text'] ?? '',
                'matched_question' => $candidate['question'] ?? '',
                'category' => $candidate['category'] ?? null,
                'intent' => $candidate['detected_intent'] ?? null,
                'url' => $candidate['url'] ?? null,
                'title' => $candidate['title'] ?? null,
            ];
        }

        foreach ($chunkCandidates as $candidate) {
            $contentText = trim(
                ($candidate['heading'] ?? '') . ' ' .
                ($candidate['title'] ?? '') . ' ' .
                ($candidate['main_heading'] ?? '') . ' ' .
                ($candidate['chunk_text'] ?? '')
            );

            $contentMatch = ai_text_match_score($tokens, $contentText, $question);

            $score = $contentMatch * 0.75;

            if ($detected['intent'] && $candidate['detected_intent'] === $detected['intent']) {
                $score += 12;
            }

            if ($detected['category'] && $candidate['category'] === $detected['category']) {
                $score += 8;
            }

            if (isset($termBoosts[(int) $candidate['chunk_id']])) {
                $score += $termBoosts[(int) $candidate['chunk_id']];
            }

            $score += min(8, ((float) $candidate['importance_score']) / 10);

            $scored[] = [
                'type' => 'content_chunk',
                'score' => min(100, round($score, 2)),
                'question_id' => null,
                'chunk_id' => (int) $candidate['chunk_id'],
                'page_id' => (int) $candidate['page_id'],
                'answer_text' => $candidate['chunk_text'] ?? '',
                'matched_question' => null,
                'category' => $candidate['category'] ?? null,
                'intent' => $candidate['detected_intent'] ?? null,
                'url' => $candidate['url'] ?? null,
                'title' => $candidate['title'] ?? null,
            ];
        }

        usort($scored, function ($a, $b) {
            return $b['score'] <=> $a['score'];
        });

        $best = $scored[0] ?? null;

        if (!$best) {
            return [
                'success' => false,
                'reply_mode' => 'no_answer',
                'message' => 'No matching knowledge found',
                'question' => $question,
                'tokens' => $tokens,
                'detected' => $detected,
                'confidence_score' => 0,
                'answer' => null,
                'sources' => [],
                'best_candidates' => []
            ];
        }

        $sources = [];

        foreach (array_slice($scored, 0, 3) as $item) {
            $sources[] = [
                'type' => $item['type'],
                'score' => $item['score'],
                'knowledge_source_id' => $item['knowledge_source_id'] ?? null,
                'page_id' => $item['page_id'] ?? null,
                'chunk_id' => $item['chunk_id'] ?? null,
                'question_id' => $item['question_id'] ?? null,
                'title' => $item['title'] ?? null,
                'url' => $item['url'] ?? null,
                'category' => $item['category'] ?? null,
                'intent' => $item['intent'] ?? null,
            ];
        }

        return [
            'success' => true,
            'reply_mode' => 'suggestion',
            'message' => 'Best answer found',
            'question' => $question,
            'tokens' => $tokens,
            'detected' => $detected,
            'confidence_score' => $best['score'],
            'answer' => ai_build_excerpt_reply($best['answer_text'], $tokens, $question),
            'matched_type' => $best['type'],
            'matched_knowledge_source_id' => $best['knowledge_source_id'] ?? null,
            'matched_chunk_id' => $best['chunk_id'] ?? null,
            'matched_question_id' => $best['question_id'] ?? null,
            'sources' => $sources,
            'best_candidates' => array_slice($scored, 0, 5)
        ];
    }
}