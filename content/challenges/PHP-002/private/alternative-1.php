<?php

declare(strict_types=1);

/**
 * Whether a password reset link has expired. Timestamps are Unix seconds;
 * a link stays valid until $issuedAt + $ttlMinutes * 60, inclusive.
 */
function isExpired(int $issuedAt, int $now, int $ttlMinutes): bool
{
    $expiresAt = (new DateTimeImmutable("@{$issuedAt}"))
        ->add(new DateInterval("PT{$ttlMinutes}M"));
    return new DateTimeImmutable("@{$now}") > $expiresAt;
}
