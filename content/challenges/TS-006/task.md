Last week's change to session refresh (#412) added a grace window so the mobile app stops logging people out when two screens refresh at the same moment. The logouts stopped, but the `refresh_reuse` alert, about 40 a day before, has not fired since, and a pentest exchanged a refresh token captured on Oct 20 for a fresh one on Oct 23 while the victim's session stayed alive.

`refresh(family, presented, now)` decides one refresh. Find everything #412 broke against the rules below and fix it. Keep the grace window: the mobile fix has to stay. `refresh` is pure: the caller stores whatever it decides. Times are Unix milliseconds.

**Sessions.** A login starts a session family. A client refreshes with the family's current refresh token and gets the next one; each refresh token works once.

- `family` is `{ id, userId, loginAt, revoked, tokens }`. `tokens` lists the family's refresh tokens oldest first, and the last is the current one. Each is `{ token, issuedAt, rotatedAt }`, where `rotatedAt` is when it was exchanged for the next token, or `null` while it is current.
- `presented` is the token string the client sent; `now` is the time of the request.

**The rules, in this order** (the first that applies decides):

1. A token that is not in the family: `{ status: "reauth", reason: "unknown", revokeFamily: false }`.
2. A revoked family (signed out everywhere, password changed): `{ status: "reauth", reason: "revoked", revokeFamily: false }`.
3. A family `SESSION_LIFETIME_MS` (30 days) or more after its `loginAt`: `{ status: "reauth", reason: "expired", revokeFamily: false }`.
4. A token that was already rotated (`rotatedAt` is not `null`):
   - up to `REFRESH_GRACE_MS` (10 seconds) after that token's own rotation, inclusive, the client lost a race with itself: `{ status: "ok", token }` with the family's current token, and nothing new is issued;
   - any later, someone else has a copy: `{ status: "reauth", reason: "reuse", revokeFamily: true }`.
5. Otherwise rotate: `{ status: "ok", token }` with the family's next token, `${family.id}.${tokens.length + 1}`.

Only "reuse" revokes the family (`revokeFamily: true`).

**Code further down the file.** `SESSION_LIFETIME_MS` (30 days) and `REFRESH_GRACE_MS` (10,000); `findToken(family, presented)` returns the family's token with that string, or `undefined`; `current(family)` returns the family's last token; `nextToken(family)` returns the string a rotation issues, as in rule 5; and the types `SessionFamily` and `RefreshResult`.

**Requirements.**

- Keep the grace window, measured with `REFRESH_GRACE_MS`.
- No console logging (`console.log`, `info`, `debug`, `warn` or `error`): the gateway's output is searchable company-wide, and must never sit next to a refresh token.
