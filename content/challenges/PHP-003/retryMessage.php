<?php

declare(strict_types=1);

/**
 * The message the login form shows while an account is locked out, for the seconds left on
 * the lock. Lockouts run from one minute up to 24 hours.
 */
function retryMessage(int $secondsLeft): string
{
    $minutes = intdiv($secondsLeft, 60);
    return "Too many attempts. Try again in {$minutes} minutes.";
}
