import type { SeedIssue } from "../seed";

/* ---------------------------------------------------------------- lockout-retry-message */

const RETRY_STARTER = `<?php

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
`;

const RETRY_REFERENCE = `<?php

declare(strict_types=1);

/**
 * The message the login form shows while an account is locked out, for the seconds left on
 * the lock. Lockouts run from one minute up to 24 hours.
 */
function retryMessage(int $secondsLeft): string
{
    // The lock can end between the check and the render.
    if ($secondsLeft <= 0) {
        return 'You can try again now.';
    }
    // Round up, so nobody is told to come back before the lock ends.
    $minutes = (int) ceil($secondsLeft / 60);
    if ($minutes < 60) {
        $wait = $minutes === 1 ? '1 minute' : "{$minutes} minutes";
    } else {
        $hours = (int) ceil($minutes / 60);
        $wait = $hours === 1 ? '1 hour' : "{$hours} hours";
    }
    return "Too many attempts. Try again in {$wait}.";
}
`;

const lockoutRetryMessage: SeedIssue = {
  id: "lockout-retry-message",
  key: "PHP-003",
  title: "Lockout message tells people to try again in 0 minutes",
  summary: "The lockout message rounds the time left down, so people retry too early and lock themselves out again.",
  difficulty: "easy",
  language: "php",
  tags: ["time", "rounding", "copy"],
  task: `During a lockout the login form says when to try again. Today it rounds the time left down, so with 30 seconds left it says **"Too many attempts. Try again in 0 minutes."**, people retry straight away and lock themselves out again.

\`retryMessage($secondsLeft)\` takes the whole seconds left on the lock and returns the message. Lockouts run from one minute up to 24 hours.

- Round the time left **up**, so nobody is told to come back before the lock ends. Never round down: no \`floor()\` or \`intdiv()\`.
- Under 60 minutes (after rounding up), say minutes: \`Too many attempts. Try again in 1 minute.\`, \`Too many attempts. Try again in 15 minutes.\`
- From 60 minutes on, say hours, also rounded up: \`Too many attempts. Try again in 1 hour.\`, \`Too many attempts. Try again in 2 hours.\`
- Use the singular for exactly 1 minute or 1 hour, the plural otherwise.
- The lock can end between the check and the page render, so the seconds left can be zero or negative. Then the form says \`You can try again now.\``,
  entrypoint: "retryMessage",
  starter: RETRY_STARTER,
  inputs: [30, 900, 61, 0, 3600, 86400, 3541, 3601, -4, 1, 60, 120, 3540, 7200, 7201, 59, 86399, 600],
  expected: [
    "Too many attempts. Try again in 1 minute.",
    "Too many attempts. Try again in 15 minutes.",
    "Too many attempts. Try again in 2 minutes.",
    "You can try again now.",
    "Too many attempts. Try again in 1 hour.",
    "Too many attempts. Try again in 24 hours.",
    "Too many attempts. Try again in 1 hour.",
    "Too many attempts. Try again in 2 hours.",
    "You can try again now.",
    "Too many attempts. Try again in 1 minute.",
    "Too many attempts. Try again in 1 minute.",
    "Too many attempts. Try again in 2 minutes.",
    "Too many attempts. Try again in 59 minutes.",
    "Too many attempts. Try again in 2 hours.",
    "Too many attempts. Try again in 3 hours.",
    "Too many attempts. Try again in 1 minute.",
    "Too many attempts. Try again in 24 hours.",
    "Too many attempts. Try again in 10 minutes.",
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  rules: [
    {
      id: "round-down",
      message: "Never round the time left down: no `floor()` or `intdiv()`.",
      when: { pattern: "\\b(floor|intdiv)\\(", present: true, file: "src/retryMessage.php" },
    },
  ],
  private: {
    reference: { "src/retryMessage.php": RETRY_REFERENCE },
    examples: {
      "round-down": {
        fires: [
          { "src/retryMessage.php": RETRY_STARTER },
          {
            "src/retryMessage.php": RETRY_REFERENCE.replace(
              "(int) ceil($secondsLeft / 60)",
              "(int) floor(($secondsLeft + 59) / 60)",
            ),
          },
        ],
        quiet: [{ "src/retryMessage.php": RETRY_REFERENCE }],
      },
    },
  },
};

/* ---------------------------------------------------------------- canonical-signup-email */

const EMAIL_STARTER = `package signup

import "strings"

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
	email := strings.TrimSpace(raw)
	if !strings.Contains(email, "@") {
		return "", false
	}
	return email, true
}
`;

const EMAIL_REFERENCE = `package signup

import (
	"strings"
	"unicode"
)

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if strings.IndexFunc(email, unicode.IsSpace) >= 0 || strings.Count(email, "@") != 1 {
		return "", false
	}
	at := strings.Index(email, "@")
	local, domain := email[:at], email[at+1:]
	if domain == "gmail.com" || domain == "googlemail.com" {
		// Gmail ignores dots and everything after a plus: all of these reach one inbox.
		if plus := strings.Index(local, "+"); plus >= 0 {
			local = local[:plus]
		}
		local = strings.ReplaceAll(local, ".", "")
		domain = "gmail.com"
	}
	if local == "" || domain == "" {
		return "", false
	}
	return local + "@" + domain, true
}
`;

const canonicalSignupEmail: SeedIssue = {
  id: "canonical-signup-email",
  key: "GO-005",
  title: "Sign-up creates a second account for the same email",
  summary: "Look accounts up by a canonical form of the address, so case, spaces and Gmail dots don't make a new account.",
  difficulty: "medium",
  language: "go",
  tags: ["strings", "validation", "normalization"],
  task: `Sign-up compares email addresses exactly as typed, so someone who signed up as \`Jane.Doe@Example.com\` and signs up again as \`jane.doe@example.com \` gets a second account. Write the key sign-up looks accounts up by, so one person gets one account however they type their address. (The address itself is still stored exactly as typed; this is only the lookup key.)

\`CanonicalEmail(raw)\` returns the key and \`ok\` true, or \`""\` and \`ok\` false for anything that is not an address we accept:

- Surrounding whitespace is ignored. Whitespace anywhere inside the address (spaces, tabs, any Unicode space) makes it invalid.
- An address has exactly one \`@\`, with something on both sides of it.
- The whole address is lowercased: every provider our users are on treats the local part case-insensitively.
- For **gmail.com** and **googlemail.com** (those exact domains after lowercasing; not their subdomains or longer domains), dots in the local part are dropped, so is everything from the first \`+\` on, and the domain becomes \`gmail.com\`. Other domains keep their dots and \`+\` tags as they are: plenty of mail servers deliver \`+\` addresses to different people.
- If the Gmail rules leave the local part empty, the address is invalid.`,
  entrypoint: "CanonicalEmail",
  starter: EMAIL_STARTER,
  inputs: [
    "Jane.Doe@Example.com",
    "  jane.doe@example.com\n",
    "J.A.N.E+newsletter@Gmail.com",
    "jane+work@example.com",
    "not-an-email",
    "jane@doe@example.com",
    "@example.com",
    "jane@",
    "jane doe@example.com",
    "jane.doe@googlemail.com",
    "+promo@gmail.com",
    "...@gmail.com",
    "Jane.Doe@GMAIL.COM",
    "jane.doe+a+b@gmail.com",
    "jane.doe@mail.gmail.com",
    "jane.doe@gmail.com.au",
    "first.last+tag@Example.COM ",
    "",
    "jane\t@example.com",
  ],
  expected: [
    "jane.doe@example.com",
    "jane.doe@example.com",
    "jane@gmail.com",
    "jane+work@example.com",
    null,
    null,
    null,
    null,
    null,
    "janedoe@gmail.com",
    null,
    null,
    "janedoe@gmail.com",
    "janedoe@gmail.com",
    "jane.doe@mail.gmail.com",
    "jane.doe@gmail.com.au",
    "first.last+tag@example.com",
    null,
    null,
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  private: {
    reference: { "canonical_email.go": EMAIL_REFERENCE },
  },
};

/* ---------------------------------------------------------------- refresh-token-reuse */

const POLICY = `/**
 * Session rules for the login gateway, as signed off by security (SEC-118).
 *
 * A login starts a session family. A client refreshes with the family's current refresh token
 * and gets the next one; each refresh token works once. A refresh is decided in this order:
 *
 *   1. A token that is not in the family: sign in again ("unknown").
 *   2. A revoked family (signed out everywhere, password changed): sign in again ("revoked").
 *   3. A family SESSION_LIFETIME_MS or more after its login: sign in again ("expired").
 *   4. A token that was already rotated:
 *      - up to REFRESH_GRACE_MS after its rotation (inclusive), the client lost a race with
 *        itself: answer with the family's current token and issue nothing new;
 *      - any later, someone else has a copy: sign in again ("reuse") and revoke the family.
 *   5. Otherwise rotate: issue the family's next token.
 *
 * Only "reuse" revokes the family: every token in it stops working, the current one included.
 */

/** Mobile sessions last 30 days from login, however often they refresh. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a just-rotated token is still answered, for clients that refresh twice at once. */
export const REFRESH_GRACE_MS = 10 * 1000;
`;

const TOKENS = `/** One refresh token in a session family. Times are Unix milliseconds. */
export interface RefreshToken {
  token: string;
  issuedAt: number;
  /** When it was exchanged for the next one; null while it is the current token. */
  rotatedAt: number | null;
}

/** Everything one login produced: its refresh tokens, oldest first; the last is current. */
export interface SessionFamily {
  id: string;
  userId: string;
  loginAt: number;
  revoked: boolean;
  tokens: RefreshToken[];
}

export type RefreshResult =
  | { status: "ok"; token: string }
  | {
      status: "reauth";
      reason: "unknown" | "revoked" | "expired" | "reuse";
      /** The store revokes the whole family when this is true. */
      revokeFamily: boolean;
    };

export function findToken(family: SessionFamily, presented: string): RefreshToken | undefined {
  return family.tokens.find((t) => t.token === presented);
}

/** The family's current refresh token: the one a client should hold right now. */
export function current(family: SessionFamily): RefreshToken {
  return family.tokens[family.tokens.length - 1];
}

/** The token a rotation issues. The store saves it and marks the presented one rotated. */
export function nextToken(family: SessionFamily): string {
  return \`\${family.id}.\${family.tokens.length + 1}\`;
}
`;

const REFRESH_STARTER = `import { REFRESH_GRACE_MS, SESSION_LIFETIME_MS } from "./policy";
import { current, findToken, nextToken, type RefreshResult, type SessionFamily } from "./tokens";

/**
 * Exchanges a refresh token for the family's next one, by the session rules. Pure: the
 * caller stores whatever this decides.
 */
export function refresh(family: SessionFamily, presented: string, now: number): RefreshResult {
  const token = findToken(family, presented);
  if (!token) return { status: "reauth", reason: "unknown", revokeFamily: false };

  // #412: the mobile app refreshes from two screens at once, and the loser of the race
  // presents the token the winner just rotated. Hand it the winner's token instead of
  // logging the user out.
  if (token.rotatedAt !== null && now - token.rotatedAt <= REFRESH_GRACE_MS) {
    return { status: "ok", token: current(family).token };
  }

  if (family.revoked) return { status: "reauth", reason: "revoked", revokeFamily: false };
  if (now - family.loginAt >= SESSION_LIFETIME_MS) {
    return { status: "reauth", reason: "expired", revokeFamily: false };
  }

  return { status: "ok", token: nextToken(family) };
}
`;

const REFRESH_REFERENCE = `import { REFRESH_GRACE_MS, SESSION_LIFETIME_MS } from "./policy";
import { current, findToken, nextToken, type RefreshResult, type SessionFamily } from "./tokens";

/**
 * Exchanges a refresh token for the family's next one, by the session rules. Pure: the
 * caller stores whatever this decides.
 */
export function refresh(family: SessionFamily, presented: string, now: number): RefreshResult {
  const token = findToken(family, presented);
  if (!token) return { status: "reauth", reason: "unknown", revokeFamily: false };
  if (family.revoked) return { status: "reauth", reason: "revoked", revokeFamily: false };
  if (now - family.loginAt >= SESSION_LIFETIME_MS) {
    return { status: "reauth", reason: "expired", revokeFamily: false };
  }

  if (token.rotatedAt !== null) {
    // #412: the mobile app refreshes from two screens at once, and the loser of the race
    // presents the token the winner just rotated. Hand it the winner's token instead of
    // logging the user out.
    if (now - token.rotatedAt <= REFRESH_GRACE_MS) {
      return { status: "ok", token: current(family).token };
    }
    // Rotated a while ago: someone else holds a copy, so end everything it could reach.
    return { status: "reauth", reason: "reuse", revokeFamily: true };
  }

  return { status: "ok", token: nextToken(family) };
}
`;

/** 2025-10-25 08:00 UTC, the login every fixture family starts from. */
const L = 1761379200000;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const LIFETIME = 30 * DAY;

/** A family whose tokens were rotated at the given times; the last token is current. */
function family(id: string, rotations: number[], revoked = false) {
  const issued = [L, ...rotations];
  return {
    id,
    userId: "u_1042",
    loginAt: L,
    revoked,
    tokens: issued.map((issuedAt, i) => ({
      token: `${id}.${i + 1}`,
      issuedAt,
      rotatedAt: rotations[i] ?? null,
    })),
  };
}

/** Rotated once, 15 minutes after login. */
const A = family("fam_7Qx", [L + 15 * MIN]);
/** The same family, signed out everywhere. */
const R = family("fam_7Qx", [L + 15 * MIN], true);
/** Rotated twice: 15 and 30 minutes after login. */
const B = family("fam_B2k", [L + 15 * MIN, L + 30 * MIN]);
/** Rotated 3 seconds before the session's lifetime ends. */
const E = family("fam_E5t", [L + LIFETIME - 3000]);

const ok = (token: string) => ({ status: "ok", token });
const reauth = (reason: string, revokeFamily = false) => ({ status: "reauth", reason, revokeFamily });

const refreshTokenReuse: SeedIssue = {
  id: "refresh-token-reuse",
  key: "TS-006",
  title: "Old refresh tokens work again since the grace window",
  summary: "A stolen refresh token kept a session alive for three days, and the reuse alert has gone quiet.",
  difficulty: "hard",
  language: "typescript",
  tags: ["security", "sessions", "code-review", "reading-code"],
  task: `Last week's change to session refresh (#412) added a grace window so the mobile app stops logging people out when two screens refresh at the same moment. The logouts stopped, but the \`refresh_reuse\` alert, about 40 a day before, has not fired since, and a pentest exchanged a refresh token captured on Oct 20 for a fresh one on Oct 23 while the victim's session stayed alive.

\`refresh(family, presented, now)\` decides one refresh. Find everything #412 broke against the rules below and fix it. Keep the grace window: the mobile fix has to stay. \`refresh\` is pure: the caller stores whatever it decides. Times are Unix milliseconds.

**Sessions.** A login starts a session family. A client refreshes with the family's current refresh token and gets the next one; each refresh token works once.

- \`family\` is \`{ id, userId, loginAt, revoked, tokens }\`. \`tokens\` lists the family's refresh tokens oldest first, and the last is the current one. Each is \`{ token, issuedAt, rotatedAt }\`, where \`rotatedAt\` is when it was exchanged for the next token, or \`null\` while it is current.
- \`presented\` is the token string the client sent; \`now\` is the time of the request.

**The rules, in this order** (the first that applies decides):

1. A token that is not in the family: \`{ status: "reauth", reason: "unknown", revokeFamily: false }\`.
2. A revoked family (signed out everywhere, password changed): \`{ status: "reauth", reason: "revoked", revokeFamily: false }\`.
3. A family \`SESSION_LIFETIME_MS\` (30 days) or more after its \`loginAt\`: \`{ status: "reauth", reason: "expired", revokeFamily: false }\`.
4. A token that was already rotated (\`rotatedAt\` is not \`null\`):
   - up to \`REFRESH_GRACE_MS\` (10 seconds) after that token's own rotation, inclusive, the client lost a race with itself: \`{ status: "ok", token }\` with the family's current token, and nothing new is issued;
   - any later, someone else has a copy: \`{ status: "reauth", reason: "reuse", revokeFamily: true }\`.
5. Otherwise rotate: \`{ status: "ok", token }\` with the family's next token, \`\${family.id}.\${tokens.length + 1}\`.

Only "reuse" revokes the family (\`revokeFamily: true\`).

**Code the file imports.** From \`./policy\`: \`SESSION_LIFETIME_MS\` (30 days) and \`REFRESH_GRACE_MS\` (10,000). From \`./tokens\`: \`findToken(family, presented)\` returns the family's token with that string, or \`undefined\`; \`current(family)\` returns the family's last token; \`nextToken(family)\` returns the string a rotation issues, as in rule 5; and the types \`SessionFamily\` and \`RefreshResult\`.

**Requirements.**

- Keep the grace window, measured with \`REFRESH_GRACE_MS\`.
- No console logging (\`console.log\`, \`info\`, \`debug\`, \`warn\` or \`error\`): the gateway's output is searchable company-wide, and must never sit next to a refresh token.`,
  entrypoint: "refresh",
  parameters: ["family", "presented", "now"],
  entry: "src/gateway/refresh.ts",
  starter: REFRESH_STARTER,
  files: [
    { path: "src/gateway/policy.ts", role: "read", language: "typescript", text: POLICY },
    { path: "src/gateway/tokens.ts", role: "read", language: "typescript", text: TOKENS },
  ],
  inputs: [
    [A, "fam_7Qx.2", L + 30 * MIN],
    [A, "fam_7Qx.1", L + 15 * MIN + 4000],
    [A, "fam_7Qx.1", L + 3 * DAY],
    [A, "fam_9Zz.4", L + 20 * MIN],
    [A, "fam_7Qx.2", L + LIFETIME],
    [R, "fam_7Qx.2", L + 30 * MIN],
    [A, "fam_7Qx.1", L + 15 * MIN + 10000],
    [A, "fam_7Qx.1", L + 15 * MIN + 10001],
    [R, "fam_7Qx.1", L + 15 * MIN + 4000],
    [E, "fam_E5t.1", L + LIFETIME + 2000],
    [A, "fam_7Qx.2", L + LIFETIME - 1],
    [B, "fam_B2k.1", L + 30 * MIN + 3000],
    [B, "fam_B2k.2", L + 30 * MIN + 5000],
    [B, "fam_B2k.3", L + 40 * MIN],
    [R, "fam_7Qx.1", L + 3 * DAY],
    [E, "fam_E5t.1", L + LIFETIME - 1000],
    [A, "", L + 20 * MIN],
  ],
  expected: [
    ok("fam_7Qx.3"),
    ok("fam_7Qx.2"),
    reauth("reuse", true),
    reauth("unknown"),
    reauth("expired"),
    reauth("revoked"),
    ok("fam_7Qx.2"),
    reauth("reuse", true),
    reauth("revoked"),
    reauth("expired"),
    ok("fam_7Qx.3"),
    reauth("reuse", true),
    ok("fam_B2k.3"),
    ok("fam_B2k.4"),
    reauth("revoked"),
    ok("fam_E5t.2"),
    reauth("unknown"),
  ],
  hidden: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  rules: [
    {
      id: "keep-grace",
      message: "Keep the grace window for a just-rotated token, measured with `REFRESH_GRACE_MS`.",
      when: { pattern: "REFRESH_GRACE_MS", present: false, file: "src/gateway/refresh.ts" },
    },
    {
      id: "no-console",
      message: "No console logging in the gateway: no `console.log`, `info`, `debug`, `warn` or `error`.",
      when: { pattern: "console\\.(log|info|debug|warn|error)\\(", present: true, file: "src/gateway/refresh.ts" },
    },
  ],
  private: {
    reference: { "src/gateway/refresh.ts": REFRESH_REFERENCE },
    examples: {
      "keep-grace": {
        fires: [
          {
            "src/gateway/refresh.ts": REFRESH_REFERENCE.replace(
              `import { REFRESH_GRACE_MS, SESSION_LIFETIME_MS } from "./policy";`,
              `import { SESSION_LIFETIME_MS } from "./policy";`,
            ).replace(
              /    \/\/ #412[\s\S]*?\n    }\n/,
              "",
            ),
          },
        ],
        quiet: [{ "src/gateway/refresh.ts": REFRESH_REFERENCE }, { "src/gateway/refresh.ts": REFRESH_STARTER }],
      },
      "no-console": {
        fires: [
          {
            "src/gateway/refresh.ts": REFRESH_REFERENCE.replace(
              "    // Rotated a while ago",
              "    console.log(\"refresh reuse\", family.id, presented);\n    // Rotated a while ago",
            ),
          },
        ],
        quiet: [{ "src/gateway/refresh.ts": REFRESH_REFERENCE }],
      },
    },
  },
};

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [lockoutRetryMessage, canonicalSignupEmail, refreshTokenReuse];
