<?php

declare(strict_types=1);

/**
 * The message the login form shows while an account is locked out, for the seconds left on
 * the lock. Lockouts run from one minute up to 24 hours.
 */
function retryMessage(int $secondsLeft): string
{
    if ($secondsLeft <= 0) return 'You can try again now.';
    $minutes = (int) ceil($secondsLeft / 60);
    if ($minutes < 60) {
        $amount = $minutes;
        $unit = $amount === 1 ? 'minute' : 'minutes';
    } else {
        $amount = (int) ceil($secondsLeft / 3600);
        $unit = $amount === 1 ? 'hour' : 'hours';
    }
    return "Too many attempts. Try again in {$amount} {$unit}.";
}
