<?php
// Rounds up but forgets that the lock may already be over: 0 seconds says "0 minutes".

declare(strict_types=1);

/**
 * The message the login form shows while an account is locked out, for the seconds left on
 * the lock. Lockouts run from one minute up to 24 hours.
 */
function retryMessage(int $secondsLeft): string
{
    $minutes = (int) ceil($secondsLeft / 60);
    if ($minutes < 60) {
        $wait = $minutes === 1 ? '1 minute' : "{$minutes} minutes";
    } else {
        $hours = (int) ceil($minutes / 60);
        $wait = $hours === 1 ? '1 hour' : "{$hours} hours";
    }
    return "Too many attempts. Try again in {$wait}.";
}
