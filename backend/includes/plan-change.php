<?php

declare(strict_types=1);

// Calendar months, clamped to the target month's last day (Jan 31 -> Feb 28/29).
function plan_change_end(DateTimeImmutable $start, string $cycle): DateTimeImmutable
{
    $months = ['monthly' => 1, 'quarterly' => 3, 'yearly' => 12][$cycle] ?? null;
    if ($months === null) throw new InvalidArgumentException('Invalid billing cycle.');
    $target = $start->modify('first day of this month')->modify('+' . $months . ' months');
    return $target->setDate((int) $target->format('Y'), (int) $target->format('m'),
        min((int) $start->format('d'), (int) $target->format('t')));
}

function plan_change_price(mixed $value): ?string
{
    // Pass decimals as strings to PDO; never silently round malformed amounts.
    if (!is_string($value) && !is_int($value) && !is_float($value)) return null;
    $value = (string) $value;
    return preg_match('/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/D', $value) ? $value : null;
}
