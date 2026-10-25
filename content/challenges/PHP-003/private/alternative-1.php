<?php

declare(strict_types=1);

/**
 * The message the login form shows while an account is locked out, for the seconds left on
 * the lock. Lockouts run from one minute up to 24 hours.
 */
function retryMessage(int $secondsLeft): string
{
    if ($secondsLeft <= 0) {
        return 'You can try again now.';
    }
    // Anything over 59 whole minutes rounds up to at least an hour.
    [$count, $unit] = $secondsLeft > 59 * 60
        ? [(int) ceil($secondsLeft / 3600), 'hour']
        : [(int) ceil($secondsLeft / 60), 'minute'];
    $plural = $count === 1 ? '' : 's';
    return sprintf('Too many attempts. Try again in %d %s%s.', $count, $unit, $plural);
}
