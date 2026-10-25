During a lockout the login form says when to try again. Today it rounds the time left down, so with 30 seconds left it says **"Too many attempts. Try again in 0 minutes."**, people retry straight away and lock themselves out again.

`retryMessage($secondsLeft)` takes the whole seconds left on the lock and returns the message. Lockouts run from one minute up to 24 hours.

- Round the time left **up**, so nobody is told to come back before the lock ends. Never round down: no `floor()` or `intdiv()`.
- Under 60 minutes (after rounding up), say minutes: `Too many attempts. Try again in 1 minute.`, `Too many attempts. Try again in 15 minutes.`
- From 60 minutes on, say hours, also rounded up: `Too many attempts. Try again in 1 hour.`, `Too many attempts. Try again in 2 hours.`
- Use the singular for exactly 1 minute or 1 hour, the plural otherwise.
- The lock can end between the check and the page render, so the seconds left can be zero or negative. Then the form says `You can try again now.`
