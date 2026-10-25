A credential-stuffing bot hit the login endpoint again last night. Limit login attempts with a sliding window.

`allow(times, limit, windowMs)` gets the times of login attempts in milliseconds, in order (several can share a time), and returns, for each attempt, whether it is allowed.

- An attempt at time `t` is allowed when fewer than `limit` allowed attempts fall in the window from just after `t − windowMs` up to and including `t`. Otherwise it is rejected.
- Rejected attempts don't count toward the limit.
- `limit` can be 0, which rejects every attempt.
