import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ADMIN_ORIGIN = "https://musclememory.run";
export const OPERATOR_EMAIL = "ekku.leivonen@gmail.com";
export const ADMIN_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
};
export class AdminDenied extends Error {
  constructor() {
    super("Operator access required.");
  }
}
export interface AdminConfig {
  issuer: string;
  audience: string;
}
export interface AdminIdentity {
  readonly subject: string;
}

/** Configuration is deployment-owned, never read from token claims or request headers. */
export function adminConfig(env: Record<string, unknown>): AdminConfig {
  const issuer = env.ADMIN_ACCESS_ISSUER;
  const audience = env.ADMIN_ACCESS_AUD;
  if (
    typeof issuer !== "string" ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    typeof audience !== "string" ||
    !/^[a-f0-9]{64}$/.test(audience)
  )
    throw new AdminDenied();
  return { issuer, audience };
}

const keys = new Map<string, JWTVerifyGetKey>();
function accessKeys(issuer: string): JWTVerifyGetKey {
  let key = keys.get(issuer);
  if (!key) {
    key = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    });
    keys.set(issuer, key);
  }
  return key;
}

/** Pure request boundary; key injection is only for signed local unit fixtures. */
export async function authorizeAdmin(
  headers: Headers,
  config: AdminConfig,
  getKey: JWTVerifyGetKey = accessKeys(config.issuer),
): Promise<AdminIdentity> {
  try {
    // Do not accept forwarded host as a substitute for the real request authority.
    if (
      headers.get("host") !== "musclememory.run" ||
      (headers.has("x-forwarded-host") &&
        headers.get("x-forwarded-host") !== "musclememory.run")
    )
      throw new AdminDenied();
    const token = headers.get("cf-access-jwt-assertion");
    if (!token || token.length > 16384) throw new AdminDenied();
    const { payload } = await jwtVerify(token, getKey, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ["exp", "iat", "sub", "email", "type"],
      clockTolerance: 0,
    });
    if (
      payload.email !== OPERATOR_EMAIL ||
      payload.type !== "app" ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.iat !== "number" ||
      payload.iat > Date.now() / 1000 ||
      typeof payload.exp !== "number" ||
      payload.exp <= payload.iat
    )
      throw new AdminDenied();
    return Object.freeze({ subject: payload.sub });
  } catch {
    throw new AdminDenied();
  }
}

/** Use on all state-changing requests, even when the Access assertion is valid. */
export function requireAdminMutationOrigin(request: Request): void {
  const url = new URL(request.url);
  if (
    !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
    url.origin !== ADMIN_ORIGIN ||
    request.headers.get("origin") !== ADMIN_ORIGIN ||
    (request.headers.has("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  )
    throw new AdminDenied();
}

/** Decode conservatively before deciding a request is public. No private aliases. */
export function isAdminPath(path: string): boolean {
  let decoded = path;
  for (let i = 0; i < 4; i++) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  const normalized = decoded.replaceAll("\\", "/").replace(/\/+/g, "/");
  // Include RSC suffixes and the alternative API namespace as defense in depth.
  return (
    /^\/admin(?:[/.;]|$)/i.test(normalized) ||
    /^\/api\/admin(?:[/.;]|$)/i.test(normalized)
  );
}
