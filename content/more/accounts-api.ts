import type { SeedIssue } from "../seed";
import { jo, mateo, sam } from "../team";

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
  title: "Lockout message tells people to try again in 0 minutes",
  summary: "The lockout message rounds the time left down, so people retry too early and lock themselves out again.",
  kind: "bug",
  difficulty: "easy",
  language: "php",
  skills: ["time", "rounding", "copy"],
  task: `Jo forwarded this from the help desk:

> I got locked out after a few wrong passwords and the page said **"Too many attempts. Try again in 0 minutes."** So I tried again straight away, and it locked me out again.

\`retryMessage($secondsLeft)\` in \`src/retryMessage.php\` writes the message the login form shows during a lockout. Lockouts run from one minute up to 24 hours.

- Round the time left **up**, so nobody is told to come back before the lock ends.
- Under 60 minutes (after rounding), say minutes: \`Too many attempts. Try again in 1 minute.\`, \`Too many attempts. Try again in 15 minutes.\`
- From 60 minutes on, say hours, also rounded up: \`Too many attempts. Try again in 1 hour.\`, \`Too many attempts. Try again in 2 hours.\`
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
  comments: [
    jo("Eleven tickets this week with a screenshot of \"0 minutes\". Most of them locked themselves out twice."),
  ],
  hints: [
    {
      text: "Work out by hand what the form should say with 59 minutes and 1 second left. Does it read as minutes or as hours?",
      when: { behaviour: "active-minutes-without-progress", atLeast: 8 },
    },
    {
      text: "Integer division drops the remainder, and the remainder is exactly the time people are being told they don't have to wait.",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "mateo-round-down",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "Rounding down is how we got \"0 minutes\" in the first place. If this rounds, can it round up?",
        "This still rounds down somewhere. Anything that rounds down here tells someone to come back before the lock ends.",
      ],
      when: { pattern: "\\b(floor|intdiv)\\(", present: true, file: "src/retryMessage.php" },
      repeat: "while-true",
    },
    {
      id: "jo-thirty-seconds",
      author: "Jo T",
      role: "Support",
      where: "issue",
      severity: "info",
      text: ["Tried the preview with 30 seconds left: \"1 minute\". That's the one I'll quote back to people."],
      when: { check: "case-1", is: "passing" },
    },
  ],
  private: {
    reference: { "src/retryMessage.php": RETRY_REFERENCE },
    examples: {
      "mateo-round-down": {
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
  title: "Sign-up creates a second account for the same email",
  summary: "Look accounts up by a canonical form of the address, so case, spaces and Gmail dots don't make a new account.",
  kind: "feature",
  difficulty: "medium",
  language: "go",
  skills: ["strings", "validation", "normalization"],
  task: `Support merges duplicate accounts by hand, and it is always the same story: someone signs up as \`Jane.Doe@Example.com\`, forgets, and signs up again a month later as \`jane.doe@example.com \` from their phone. Sign-up compares addresses exactly as typed, so it never finds the first account.

\`CanonicalEmail(raw)\` in \`canonical_email.go\` should return the key sign-up looks accounts up by, and \`ok\` false for anything we don't accept as an address:

- Surrounding whitespace is ignored. Whitespace anywhere inside the address makes it invalid.
- An address has exactly one \`@\`, with something on both sides of it.
- The whole address is lowercased: every provider our users are on treats the local part case-insensitively.
- For **gmail.com** and **googlemail.com** (those exact domains, nothing else), dots in the local part are dropped, so is everything from the first \`+\` on, and the domain becomes \`gmail.com\`. Other domains keep their dots and \`+\` tags as they are: plenty of mail servers deliver \`+\` addresses to different people.
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
  comments: [
    jo("31 duplicate accounts merged by hand this month. Every pair differs only by capitals, a trailing space or Gmail dots."),
    mateo("This only builds the lookup key. We keep storing the address exactly as typed, so emails still go to what the person entered."),
  ],
  hints: [
    {
      text: "Settle whether an address is valid before applying the Gmail rules, then check once more after them: dropping a tag can leave nothing behind.",
      when: { behaviour: "active-minutes-without-progress", atLeast: 12 },
    },
    {
      text: "Which domains count as Gmail? Try an address at a subdomain of gmail.com, and one at gmail.com.au, against your check.",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "mateo-long-function",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "nit",
      text: ["Nit: `CanonicalEmail` is getting long. Would the Gmail rules read better as a small helper of their own?"],
      when: { metric: "function-lines", above: 30, file: "canonical_email.go" },
    },
    {
      id: "jo-gmail-dots",
      author: "Jo T",
      role: "Support",
      where: "issue",
      severity: "info",
      text: ["Saw the Gmail dots case go green. That's about half of the duplicates I merge."],
      when: { check: "case-3", is: "passing" },
    },
  ],
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
 * Exchanges a refresh token for the family's next one, by the rules in policy.ts. Pure: the
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
 * Exchanges a refresh token for the family's next one, by the rules in policy.ts. Pure: the
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
  title: "Old refresh tokens work again since the grace window",
  summary: "A stolen refresh token kept a session alive for three days, and the reuse alert has gone quiet.",
  kind: "bug",
  difficulty: "hard",
  language: "typescript",
  skills: ["security", "sessions", "code-review", "reading-code"],
  task: `Mateo's change to session refresh last Tuesday (#412) added a grace window, so the mobile app stops logging people out when two screens refresh at the same moment. The logouts stopped. Two other things started:

> **Sam (on-call):** The \`refresh_reuse\` alert hasn't fired once since Tuesday. It averaged about 40 a day before. Either every credential thief retired, or we stopped noticing them.

> **Pentest report, finding 3 (high):** A refresh token captured from a test device on Oct 20 was exchanged for a fresh one on Oct 23. The victim's session stayed alive the whole time.

\`refresh(family, presented, now)\` in \`src/gateway/refresh.ts\` decides each refresh. The rules security signed off on are in \`src/gateway/policy.ts\`, including the order the checks happen in. Find everything #412 broke against them and fix it. Keep the grace window: the mobile fix has to stay. Times are Unix milliseconds.`,
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
  comments: [
    sam("Paging on refresh_reuse is muted until this ships. I'd like it back before the weekend."),
    mateo("That's my change, sorry. I tested the race on two phones and never tried an old token. Happy to review."),
  ],
  hints: [
    {
      text: "Follow the pentester's token, rotated three days before it came back, through `refresh` one line at a time. Which return does it reach, and which one should it?",
      when: { behaviour: "active-minutes-without-progress", atLeast: 12 },
    },
    {
      text: "Put the checks in refresh.ts next to the numbered list in policy.ts. A token inside the grace window skips some checks it should not skip.",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "mateo-keep-grace",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "This takes the grace window out, and that's what fixed the mobile logouts (Jo had 300 tickets the week before #412). Can we keep it and fix the reuse path around it?",
        "Without `REFRESH_GRACE_MS` the two-screen race logs people out again. Please keep the grace window in.",
      ],
      when: { pattern: "REFRESH_GRACE_MS", present: false, file: "src/gateway/refresh.ts" },
      repeat: "while-true",
    },
    {
      id: "sam-no-console",
      author: "Sam R",
      role: "SRE",
      where: "review",
      severity: "blocking",
      text: [
        "Please no console logging in the gateway: stdout goes straight to Datadog, and anything logged next to a refresh token ends up searchable by half the company.",
      ],
      when: { pattern: "console\\.(log|info|debug|warn|error)\\(", present: true, file: "src/gateway/refresh.ts" },
      repeat: "while-true",
    },
    {
      id: "sam-pentest-green",
      author: "Sam R",
      role: "SRE",
      where: "issue",
      severity: "info",
      text: ["The pentest token gets refused on your branch. I'll unmute the reuse alert once this merges."],
      when: { check: "case-3", is: "passing" },
    },
  ],
  private: {
    reference: { "src/gateway/refresh.ts": REFRESH_REFERENCE },
    examples: {
      "mateo-keep-grace": {
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
      "sam-no-console": {
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
