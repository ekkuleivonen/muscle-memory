// The grace check still runs before the lifetime check, so a just-rotated token outlives its session.
/**
 * Exchanges a refresh token for the family's next one, by the session rules. Pure: the
 * caller stores whatever this decides.
 */
export function refresh(family: SessionFamily, presented: string, now: number): RefreshResult {
  const token = findToken(family, presented);
  if (!token) return { status: "reauth", reason: "unknown", revokeFamily: false };
  if (family.revoked) return { status: "reauth", reason: "revoked", revokeFamily: false };

  if (token.rotatedAt !== null) {
    // The mobile app refreshes from two screens at once, and the loser of the race
    // presents the token the winner just rotated. Hand it the winner's token instead of
    // logging the user out.
    if (now - token.rotatedAt <= REFRESH_GRACE_MS) {
      return { status: "ok", token: current(family).token };
    }
    // Rotated a while ago: someone else holds a copy, so end everything it could reach.
    return { status: "reauth", reason: "reuse", revokeFamily: true };
  }

  if (now - family.loginAt >= SESSION_LIFETIME_MS) {
    return { status: "reauth", reason: "expired", revokeFamily: false };
  }

  return { status: "ok", token: nextToken(family) };
}


// ---- policy: helpers this code uses. You shouldn't need to change them. ----

/**
 * Session rules for the login gateway.
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
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a just-rotated token is still answered, for clients that refresh twice at once. */
const REFRESH_GRACE_MS = 10 * 1000;


// ---- tokens: helpers this code uses. You shouldn't need to change them. ----

/** One refresh token in a session family. Times are Unix milliseconds. */
interface RefreshToken {
  token: string;
  issuedAt: number;
  /** When it was exchanged for the next one; null while it is the current token. */
  rotatedAt: number | null;
}

/** Everything one login produced: its refresh tokens, oldest first; the last is current. */
interface SessionFamily {
  id: string;
  userId: string;
  loginAt: number;
  revoked: boolean;
  tokens: RefreshToken[];
}

type RefreshResult =
  | { status: "ok"; token: string }
  | {
      status: "reauth";
      reason: "unknown" | "revoked" | "expired" | "reuse";
      /** The store revokes the whole family when this is true. */
      revokeFamily: boolean;
    };

function findToken(family: SessionFamily, presented: string): RefreshToken | undefined {
  return family.tokens.find((t) => t.token === presented);
}

/** The family's current refresh token: the one a client should hold right now. */
function current(family: SessionFamily): RefreshToken {
  return family.tokens[family.tokens.length - 1];
}

/** The token a rotation issues. The store saves it and marks the presented one rotated. */
function nextToken(family: SessionFamily): string {
  return `${family.id}.${family.tokens.length + 1}`;
}
