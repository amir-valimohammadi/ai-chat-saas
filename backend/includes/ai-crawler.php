<?php

// مسیر فایل: ai-chat-saas/backend/includes/ai-crawler.php
// هدف: خزشگر سبک برای جمع‌آوری، دسته‌بندی و آماده‌سازی دانش سایت

require_once __DIR__ . '/ai-helpers.php';

if (!function_exists('ai_normalize_text')) {
    function ai_normalize_text(string $text): string
    {
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        $replacements = [
            'ي' => 'ی',
            'ك' => 'ک',
            'ۀ' => 'ه',
            'ة' => 'ه',
            'ؤ' => 'و',
            'إ' => 'ا',
            'أ' => 'ا',
            'آ' => 'آ',
            "\xC2\xA0" => ' ',
        ];

        $text = strtr($text, $replacements);
        $text = preg_replace('/[ \t]+/u', ' ', $text);
        $text = preg_replace('/\R{2,}/u', "\n", $text);
        $text = trim($text);

        return $text;
    }
}

if (!function_exists('ai_site_base_url')) {
    function ai_site_base_url(string $domain): string
    {
        $domain = trim($domain);

        if (preg_match('/^https?:\/\//i', $domain)) {
            return rtrim($domain, '/');
        }

        $host = strtolower($domain);

        if (
            $host === 'localhost' ||
            str_ends_with($host, '.local') ||
            str_starts_with($host, '127.') ||
            str_starts_with($host, '192.168.')
        ) {
            return 'http://' . rtrim($domain, '/');
        }

        return 'https://' . rtrim($domain, '/');
    }
}

if (!function_exists('ai_clean_url')) {
    function ai_clean_url(string $url): string
    {
        $url = trim($url);
        $url = strtok($url, '#') ?: $url;
        $url = preg_replace('/\s+/u', '', $url);

        if (strlen($url) > 1) {
            $url = rtrim($url, '/');
        }

        return $url;
    }
}

if (!function_exists('ai_absolute_url')) {
    function ai_absolute_url(string $baseUrl, string $href): ?string
    {
        $href = trim($href);

        if ($href === '') {
            return null;
        }

        if (preg_match('/^(mailto|tel|javascript|data):/i', $href)) {
            return null;
        }

        if (str_starts_with($href, '#')) {
            return null;
        }

        $baseParts = parse_url($baseUrl);

        if (!$baseParts || empty($baseParts['scheme']) || empty($baseParts['host'])) {
            return null;
        }

        if (preg_match('/^https?:\/\//i', $href)) {
            return ai_clean_url($href);
        }

        if (str_starts_with($href, '//')) {
            return ai_clean_url($baseParts['scheme'] . ':' . $href);
        }

        $scheme = $baseParts['scheme'];
        $host = $baseParts['host'];
        $port = isset($baseParts['port']) ? ':' . $baseParts['port'] : '';

        if (str_starts_with($href, '/')) {
            return ai_clean_url($scheme . '://' . $host . $port . $href);
        }

        $path = $baseParts['path'] ?? '/';
        $dir = preg_replace('#/[^/]*$#', '/', $path);

        $fullPath = $dir . $href;
        $segments = [];

        foreach (explode('/', $fullPath) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            if ($segment === '..') {
                array_pop($segments);
                continue;
            }

            $segments[] = $segment;
        }

        return ai_clean_url($scheme . '://' . $host . $port . '/' . implode('/', $segments));
    }
}

if (!function_exists('ai_fetch_url')) {
    function ai_fetch_url(string $url): array
    {
        $url = ai_clean_url($url);

        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return [
                'success' => false,
                'status_code' => 0,
                'body' => '',
                'error' => 'Invalid URL'
            ];
        }

        if (function_exists('curl_init')) {
            $ch = curl_init($url);

            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_USERAGENT => 'AI-Chat-SaaS-Crawler/1.0',
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_HTTPHEADER => [
                    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ],
            ]);

            $body = curl_exec($ch);
            $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);

            curl_close($ch);

            return [
                'success' => $body !== false && $statusCode >= 200 && $statusCode < 400,
                'status_code' => $statusCode,
                'body' => $body !== false ? (string) $body : '',
                'error' => $error ?: null
            ];
        }

        $context = stream_context_create([
            'http' => [
                'timeout' => 15,
                'ignore_errors' => true,
                'header' => "User-Agent: AI-Chat-SaaS-Crawler/1.0\r\nAccept: text/html\r\n"
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ]
        ]);

        $body = @file_get_contents($url, false, $context);
        $statusCode = 0;

        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $header) {
                if (preg_match('/HTTP\/\S+\s+(\d+)/', $header, $matches)) {
                    $statusCode = (int) $matches[1];
                    break;
                }
            }
        }

        return [
            'success' => $body !== false && $statusCode >= 200 && $statusCode < 400,
            'status_code' => $statusCode,
            'body' => $body !== false ? (string) $body : '',
            'error' => $body === false ? 'Failed to fetch URL' : null
        ];
    }
}

if (!function_exists('ai_extract_html_content')) {
    function ai_extract_html_content(string $html): array
    {
        $html = trim($html);

        if ($html === '') {
            return [
                'title' => null,
                'meta_description' => null,
                'main_heading' => null,
                'clean_text' => '',
                'links' => []
            ];
        }

        libxml_use_internal_errors(true);

        $dom = new DOMDocument();

        $encodedHtml = mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8');
        @$dom->loadHTML($encodedHtml);

        $xpath = new DOMXPath($dom);

        $title = null;
        $titleNodes = $dom->getElementsByTagName('title');

        if ($titleNodes->length > 0) {
            $title = ai_normalize_text($titleNodes->item(0)->textContent);
        }

        $metaDescription = null;

        foreach ($dom->getElementsByTagName('meta') as $meta) {
            $name = strtolower((string) $meta->getAttribute('name'));

            if ($name === 'description') {
                $metaDescription = ai_normalize_text((string) $meta->getAttribute('content'));
                break;
            }
        }

        $mainHeading = null;
        $h1Nodes = $dom->getElementsByTagName('h1');

        if ($h1Nodes->length > 0) {
            $mainHeading = ai_normalize_text($h1Nodes->item(0)->textContent);
        }

        $links = [];

        foreach ($dom->getElementsByTagName('a') as $a) {
            $href = trim((string) $a->getAttribute('href'));

            if ($href !== '') {
                $links[] = $href;
            }
        }

        foreach (['script', 'style', 'noscript', 'svg', 'iframe', 'form', 'nav', 'header', 'footer'] as $tag) {
            $nodes = $dom->getElementsByTagName($tag);

            for ($i = $nodes->length - 1; $i >= 0; $i--) {
                $node = $nodes->item($i);

                if ($node && $node->parentNode) {
                    $node->parentNode->removeChild($node);
                }
            }
        }

        $readableNodes = $xpath->query('//h1 | //h2 | //h3 | //h4 | //p | //li | //td | //th');

        $lines = [];

        if ($readableNodes) {
            foreach ($readableNodes as $node) {
                $line = ai_normalize_text($node->textContent);

                if ($line === '') {
                    continue;
                }

                if (mb_strlen($line) < 2) {
                    continue;
                }

                $lines[] = $line;
            }
        }

        if (!$lines) {
            $bodyNodes = $dom->getElementsByTagName('body');
            $fallbackText = '';

            if ($bodyNodes->length > 0) {
                $fallbackText = $bodyNodes->item(0)->textContent;
            } else {
                $fallbackText = $dom->textContent;
            }

            $fallbackText = ai_normalize_text($fallbackText);
            $lines = preg_split('/\n+/u', $fallbackText) ?: [];
        }

        $uniqueLines = [];
        $seen = [];

        foreach ($lines as $line) {
            $line = ai_normalize_text($line);
            $hash = hash('sha256', $line);

            if (isset($seen[$hash])) {
                continue;
            }

            $seen[$hash] = true;
            $uniqueLines[] = $line;
        }

        libxml_clear_errors();

        return [
            'title' => $title ?: null,
            'meta_description' => $metaDescription ?: null,
            'main_heading' => $mainHeading ?: null,
            'clean_text' => implode("\n", $uniqueLines),
            'links' => array_values(array_unique($links))
        ];
    }
}

if (!function_exists('ai_detect_category_and_intent')) {
    function ai_detect_category_and_intent(string $url, ?string $title, string $text, ?string $categoryHint = null): array
    {
        $haystack = mb_strtolower(ai_normalize_text($url . ' ' . ($title ?? '') . ' ' . mb_substr($text, 0, 2500)));

        $rules = [
            'pricing' => [
                'category' => 'قیمت / تعرفه',
                'intent' => 'pricing',
                'keywords' => ['قیمت', 'هزینه', 'تعرفه', 'مبلغ', 'پرداخت', 'چقدر', 'price', 'pricing', 'cost']
            ],
            'contact' => [
                'category' => 'تماس و مراجعه',
                'intent' => 'contact',
                'keywords' => ['تماس', 'آدرس', 'ادرس', 'تلفن', 'لوکیشن', 'موقعیت', 'نشانی', 'contact', 'location']
            ],
            'appointment' => [
                'category' => 'نوبت‌دهی',
                'intent' => 'appointment',
                'keywords' => ['نوبت', 'رزرو', 'وقت', 'مشاوره', 'booking', 'appointment']
            ],
            'faq' => [
                'category' => 'سوالات متداول',
                'intent' => 'faq',
                'keywords' => ['سوالات متداول', 'پرسش', 'faq', 'question']
            ],
            'shipping' => [
                'category' => 'ارسال و تحویل',
                'intent' => 'shipping',
                'keywords' => ['ارسال', 'تحویل', 'پست', 'مرسوله', 'shipping', 'delivery']
            ],
            'services' => [
                'category' => 'خدمات',
                'intent' => 'service_info',
                'keywords' => ['خدمات', 'سرویس', 'درمان', 'جراحی', 'محصول', 'service', 'services']
            ],
            'blog' => [
                'category' => 'مقالات آموزشی',
                'intent' => 'content_info',
                'keywords' => ['مقاله', 'بلاگ', 'آموزش', 'راهنما', 'blog', 'article']
            ],
        ];

        if ($categoryHint && isset($rules[$categoryHint])) {
            return [
                'category' => $rules[$categoryHint]['category'],
                'intent' => $rules[$categoryHint]['intent']
            ];
        }

        foreach ($rules as $rule) {
            foreach ($rule['keywords'] as $keyword) {
                if (mb_strpos($haystack, mb_strtolower($keyword)) !== false) {
                    return [
                        'category' => $rule['category'],
                        'intent' => $rule['intent']
                    ];
                }
            }
        }

        return [
            'category' => 'عمومی',
            'intent' => 'general_info'
        ];
    }
}
if (!function_exists('ai_split_chunks')) {
    function ai_split_chunks(string $text, int $minLength = 80, int $maxLength = 650): array
    {
        $text = ai_normalize_text($text);

        if ($text === '') {
            return [];
        }

        $lines = preg_split('/\n+/u', $text) ?: [];

        $isHeading = function (string $line): bool {
            $line = trim($line);

            if ($line === '') {
                return false;
            }

            if (mb_strlen($line) > 90) {
                return false;
            }

            if (preg_match('/[.!؟?،:؛]/u', $line)) {
                return false;
            }

            return true;
        };

        $chunks = [];
        $currentHeading = null;
        $currentBody = '';

        foreach ($lines as $line) {
            $line = ai_normalize_text($line);

            if ($line === '') {
                continue;
            }

            if ($isHeading($line)) {
                if ($currentBody !== '') {
                    $chunk = trim(($currentHeading ? $currentHeading . "\n" : '') . $currentBody);

                    if (mb_strlen($chunk) >= $minLength) {
                        $chunks[] = $chunk;
                    }
                }

                $currentHeading = $line;
                $currentBody = '';
                continue;
            }

            if (mb_strlen($currentBody . ' ' . $line) > $maxLength) {
                $chunk = trim(($currentHeading ? $currentHeading . "\n" : '') . $currentBody);

                if (mb_strlen($chunk) >= $minLength) {
                    $chunks[] = $chunk;
                }

                $currentBody = $line;
                continue;
            }

            $currentBody = trim($currentBody . ' ' . $line);
        }

        if ($currentBody !== '') {
            $chunk = trim(($currentHeading ? $currentHeading . "\n" : '') . $currentBody);

            if (mb_strlen($chunk) >= $minLength) {
                $chunks[] = $chunk;
            }
        }

        if (!$chunks && mb_strlen($text) >= $minLength) {
            $sentences = preg_split('/(?<=[.!؟?])\s+/u', $text) ?: [];
            $buffer = '';

            foreach ($sentences as $sentence) {
                $sentence = trim($sentence);

                if ($sentence === '') {
                    continue;
                }

                if (mb_strlen($buffer . ' ' . $sentence) <= $maxLength) {
                    $buffer = trim($buffer . ' ' . $sentence);
                    continue;
                }

                if (mb_strlen($buffer) >= $minLength) {
                    $chunks[] = $buffer;
                }

                $buffer = $sentence;
            }

            if (mb_strlen($buffer) >= $minLength) {
                $chunks[] = $buffer;
            }
        }

        return array_values(array_slice($chunks, 0, 100));
    }
}

if (!function_exists('ai_extract_terms')) {
    function ai_extract_terms(string $text, ?string $title = null, ?string $heading = null): array
    {
        $text = mb_strtolower(ai_normalize_text($text));
        $title = mb_strtolower(ai_normalize_text((string) $title));
        $heading = mb_strtolower(ai_normalize_text((string) $heading));

        $stopWords = [
            'این', 'آن', 'برای', 'با', 'به', 'از', 'در', 'را', 'که', 'یک', 'یا', 'اما', 'اگر',
            'است', 'هست', 'می', 'شود', 'کرد', 'های', 'ها', 'تر', 'ترین', 'شما', 'ما', 'من',
            'the', 'and', 'or', 'for', 'with', 'this', 'that', 'you', 'your', 'are', 'is'
        ];

        $clean = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $text);
        $words = preg_split('/\s+/u', trim((string) $clean)) ?: [];

        $frequency = [];

        foreach ($words as $word) {
            $word = trim($word);

            if (mb_strlen($word) < 3) {
                continue;
            }

            if (in_array($word, $stopWords, true)) {
                continue;
            }

            $frequency[$word] = ($frequency[$word] ?? 0) + 1;
        }

        $terms = [];

        foreach ($frequency as $term => $count) {
            $score = $count * 10;

            if ($title && mb_strpos($title, $term) !== false) {
                $score += 20;
            }

            if ($heading && mb_strpos($heading, $term) !== false) {
                $score += 15;
            }

            $terms[] = [
                'term' => $term,
                'normalized_term' => $term,
                'term_type' => 'word',
                'frequency' => $count,
                'score' => round($score, 3),
            ];
        }

        usort($terms, function ($a, $b) {
            return $b['score'] <=> $a['score'];
        });

        return array_slice($terms, 0, 40);
    }
}

if (!function_exists('ai_generate_questions_from_chunk')) {
    function ai_generate_questions_from_chunk(?string $title, ?string $heading, string $category, string $intent, string $chunkText): array
    {
        $topic = trim((string) ($heading ?: $title));

        if ($topic === '') {
            $words = ai_extract_terms($chunkText);
            $topic = $words[0]['term'] ?? 'این موضوع';
        }

        $topic = mb_substr($topic, 0, 90);

        $questions = [];

        if ($intent === 'pricing') {
            $questions[] = "هزینه {$topic} چقدر است؟";
            $questions[] = "تعرفه {$topic} چگونه محاسبه می‌شود؟";
        } elseif ($intent === 'appointment') {
            $questions[] = "چطور می‌توانم برای {$topic} نوبت بگیرم؟";
            $questions[] = "آیا برای {$topic} نیاز به رزرو وقت دارم؟";
        } elseif ($intent === 'contact') {
            $questions[] = "آدرس شما کجاست؟";
            $questions[] = "شماره تماس شما چیست؟";
            $questions[] = "ساعت کاری شما چه زمانی است؟";
        } elseif ($intent === 'shipping') {
            $questions[] = "ارسال سفارش چقدر زمان می‌برد؟";
            $questions[] = "شرایط ارسال و تحویل چیست؟";
        } elseif ($intent === 'service_info') {
            $questions[] = "{$topic} چیست؟";
            $questions[] = "{$topic} برای چه کسانی مناسب است؟";
            $questions[] = "برای {$topic} چه اطلاعاتی لازم است؟";
        } else {
            $questions[] = "درباره {$topic} توضیح می‌دهید؟";
            $questions[] = "اطلاعات مربوط به {$topic} چیست؟";
        }

        return array_values(array_unique($questions));
    }
}

if (!function_exists('ai_store_page_knowledge')) {
    function ai_store_page_knowledge(PDO $pdo, array $site, ?int $crawlRunId, ?int $sourceId, string $url, int $statusCode, array $content, ?string $categoryHint = null): array
    {
        $tenantId = (int) $site['tenant_id'];
        $siteId = (int) $site['id'];

        $text = $content['clean_text'] ?? '';
        $wordCount = str_word_count(strip_tags($text));

        $detected = ai_detect_category_and_intent(
            $url,
            $content['title'] ?? null,
            $text,
            $categoryHint
        );

        $urlHash = hash('sha256', ai_clean_url($url));
        $contentHash = hash('sha256', ai_normalize_text($text));

        $stmt = $pdo->prepare("
            INSERT INTO ai_pages (
                tenant_id,
                site_id,
                crawl_run_id,
                source_id,
                url,
                url_hash,
                title,
                meta_description,
                main_heading,
                clean_text,
                content_hash,
                category,
                detected_intent,
                status_code,
                crawl_status,
                word_count,
                last_crawled_at
            ) VALUES (
                :tenant_id,
                :site_id,
                :crawl_run_id,
                :source_id,
                :url,
                :url_hash,
                :title,
                :meta_description,
                :main_heading,
                :clean_text,
                :content_hash,
                :category,
                :detected_intent,
                :status_code,
                'success',
                :word_count,
                NOW()
            )
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                crawl_run_id = VALUES(crawl_run_id),
                source_id = VALUES(source_id),
                title = VALUES(title),
                meta_description = VALUES(meta_description),
                main_heading = VALUES(main_heading),
                clean_text = VALUES(clean_text),
                content_hash = VALUES(content_hash),
                category = VALUES(category),
                detected_intent = VALUES(detected_intent),
                status_code = VALUES(status_code),
                crawl_status = 'success',
                word_count = VALUES(word_count),
                last_crawled_at = NOW()
        ");

        $stmt->execute([
            ':tenant_id' => $tenantId,
            ':site_id' => $siteId,
            ':crawl_run_id' => $crawlRunId,
            ':source_id' => $sourceId,
            ':url' => ai_clean_url($url),
            ':url_hash' => $urlHash,
            ':title' => $content['title'] ?? null,
            ':meta_description' => $content['meta_description'] ?? null,
            ':main_heading' => $content['main_heading'] ?? null,
            ':clean_text' => $text,
            ':content_hash' => $contentHash,
            ':category' => $detected['category'],
            ':detected_intent' => $detected['intent'],
            ':status_code' => $statusCode,
            ':word_count' => $wordCount,
        ]);

        $pageId = (int) $pdo->lastInsertId();

        $deleteStmt = $pdo->prepare("DELETE FROM ai_content_chunks WHERE page_id = :page_id");
        $deleteStmt->execute([':page_id' => $pageId]);

        $chunks = ai_split_chunks($text);
        $createdChunks = 0;
        $createdTerms = 0;
        $createdQuestions = 0;

        foreach ($chunks as $index => $chunkText) {
            $terms = ai_extract_terms($chunkText, $content['title'] ?? null, $content['main_heading'] ?? null);
            $importance = 20 + min(60, count($terms) * 2);

            $chunkHash = hash('sha256', ai_normalize_text($chunkText));

            $chunkStmt = $pdo->prepare("
                INSERT INTO ai_content_chunks (
                    tenant_id,
                    site_id,
                    page_id,
                    chunk_index,
                    heading,
                    chunk_text,
                    normalized_text,
                    category,
                    detected_intent,
                    keywords_json,
                    importance_score,
                    content_hash,
                    status
                ) VALUES (
                    :tenant_id,
                    :site_id,
                    :page_id,
                    :chunk_index,
                    :heading,
                    :chunk_text,
                    :normalized_text,
                    :category,
                    :detected_intent,
                    :keywords_json,
                    :importance_score,
                    :content_hash,
                    'active'
                )
            ");

            $chunkStmt->execute([
                ':tenant_id' => $tenantId,
                ':site_id' => $siteId,
                ':page_id' => $pageId,
                ':chunk_index' => $index,
                ':heading' => $content['main_heading'] ?? $content['title'] ?? null,
                ':chunk_text' => $chunkText,
                ':normalized_text' => ai_normalize_text($chunkText),
                ':category' => $detected['category'],
                ':detected_intent' => $detected['intent'],
                ':keywords_json' => json_encode(array_slice($terms, 0, 15), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':importance_score' => $importance,
                ':content_hash' => $chunkHash,
            ]);

            $chunkId = (int) $pdo->lastInsertId();
            $createdChunks++;

            foreach ($terms as $term) {
                $termStmt = $pdo->prepare("
                    INSERT INTO ai_terms (
                        tenant_id,
                        site_id,
                        page_id,
                        chunk_id,
                        term,
                        normalized_term,
                        term_type,
                        category,
                        detected_intent,
                        frequency,
                        score
                    ) VALUES (
                        :tenant_id,
                        :site_id,
                        :page_id,
                        :chunk_id,
                        :term,
                        :normalized_term,
                        :term_type,
                        :category,
                        :detected_intent,
                        :frequency,
                        :score
                    )
                ");

                $termStmt->execute([
                    ':tenant_id' => $tenantId,
                    ':site_id' => $siteId,
                    ':page_id' => $pageId,
                    ':chunk_id' => $chunkId,
                    ':term' => $term['term'],
                    ':normalized_term' => $term['normalized_term'],
                    ':term_type' => $term['term_type'],
                    ':category' => $detected['category'],
                    ':detected_intent' => $detected['intent'],
                    ':frequency' => $term['frequency'],
                    ':score' => $term['score'],
                ]);

                $createdTerms++;
            }

            $questions = ai_generate_questions_from_chunk(
                $content['title'] ?? null,
                $content['main_heading'] ?? null,
                $detected['category'],
                $detected['intent'],
                $chunkText
            );

            foreach ($questions as $question) {
                $existsStmt = $pdo->prepare("
                    SELECT id
                    FROM ai_generated_questions
                    WHERE site_id = :site_id
                      AND question = :question
                    LIMIT 1
                ");

                $existsStmt->execute([
                    ':site_id' => $siteId,
                    ':question' => $question,
                ]);

                if ($existsStmt->fetch()) {
                    continue;
                }

                $questionStmt = $pdo->prepare("
                    INSERT INTO ai_generated_questions (
                        tenant_id,
                        site_id,
                        page_id,
                        chunk_id,
                        question,
                        normalized_question,
                        answer_text,
                        category,
                        detected_intent,
                        source_type,
                        score,
                        status
                    ) VALUES (
                        :tenant_id,
                        :site_id,
                        :page_id,
                        :chunk_id,
                        :question,
                        :normalized_question,
                        :answer_text,
                        :category,
                        :detected_intent,
                        'template',
                        :score,
                        'active'
                    )
                ");

                $questionStmt->execute([
                    ':tenant_id' => $tenantId,
                    ':site_id' => $siteId,
                    ':page_id' => $pageId,
                    ':chunk_id' => $chunkId,
                    ':question' => $question,
                    ':normalized_question' => ai_normalize_text($question),
                    ':answer_text' => mb_substr($chunkText, 0, 900),
                    ':category' => $detected['category'],
                    ':detected_intent' => $detected['intent'],
                    ':score' => $importance,
                ]);

                $createdQuestions++;
            }
        }

        return [
            'page_id' => $pageId,
            'chunks' => $createdChunks,
            'terms' => $createdTerms,
            'questions' => $createdQuestions,
            'category' => $detected['category'],
            'intent' => $detected['intent'],
        ];
    }
}

if (!function_exists('ai_extract_sitemap_urls')) {
    function ai_extract_sitemap_urls(string $xml): array
    {
        $urls = [];

        if (preg_match_all('/<loc>\s*(.*?)\s*<\/loc>/is', $xml, $matches)) {
            foreach ($matches[1] as $url) {
                $url = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8'));

                if (filter_var($url, FILTER_VALIDATE_URL)) {
                    $urls[] = ai_clean_url($url);
                }
            }
        }

        return array_values(array_unique($urls));
    }
}

if (!function_exists('ai_path_matches_prefix')) {
    function ai_path_matches_prefix(string $url, string $prefix): bool
    {
        $path = parse_url($url, PHP_URL_PATH) ?: '/';

        $prefix = trim($prefix);

        if ($prefix === '' || $prefix === '/') {
            return true;
        }

        $prefix = rtrim(str_replace('*', '', $prefix), '/');

        return str_starts_with(rtrim($path, '/'), $prefix);
    }
}