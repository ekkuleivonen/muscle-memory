<?php
// Picks minutes or hours from the raw seconds, so 3541 seconds says "60 minutes" instead of 1 hour.

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
    if ($secondsLeft < 3600) {
        $minutes = (int) ceil($secondsLeft / 60);
        $wait = $minutes === 1 ? '1 minute' : "{$minutes} minutes";
    } else {
        $hours = (int) ceil($secondsLeft / 3600);
        $wait = $hours === 1 ? '1 hour' : "{$hours} hours";
    }
    return "Too many attempts. Try again in {$wait}.";
}
