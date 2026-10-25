Customers say password reset emails never work. They do, if you click within a minute: links expire far too early.

`isExpired($issuedAt, $now, $ttlMinutes)` returns whether a password reset link has expired. `$issuedAt` and `$now` are Unix timestamps in seconds, and `$ttlMinutes` is how long the link lasts, in minutes (0 or more).

- A link stays valid up to and including `$issuedAt + $ttlMinutes × 60`. It is expired only at a later time.
