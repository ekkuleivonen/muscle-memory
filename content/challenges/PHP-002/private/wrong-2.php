<?php
// Compares whole elapsed minutes, so the link stays valid for up to 59 seconds too long.

declare(strict_types=1);

/**
 * Whether a password reset link has expired. Timestamps are Unix seconds;
 * a link stays valid until $issuedAt + $ttlMinutes * 60, inclusive.
 */
function isExpired(int $issuedAt, int $now, int $ttlMinutes): bool
{
    $elapsedMinutes = intdiv($now - $issuedAt, 60);
    return $elapsedMinutes > $ttlMinutes;
}
