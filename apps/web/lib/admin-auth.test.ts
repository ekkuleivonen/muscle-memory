import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import {
  adminConfig,
  authorizeAdmin,
  isAdminPath,
  requireAdminMutationOrigin,
  OPERATOR_EMAIL,
} from "./admin-auth";
import { auditedAdminMutation } from "./admin-audit";

const issuer = "https://fixture.cloudflareaccess.com";
const audience = "a".repeat(64);
const config = { issuer, audience };
const { privateKey, publicKey } = await generateKeyPair("RS256");
const publicJwk = {
  ...(await exportJWK(publicKey)),
  kid: "fixture",
  alg: "RS256",
  use: "sig",
};
const getKey = createLocalJWKSet({ keys: [publicJwk] });
const now = Math.floor(Date.now() / 1000);
async function token(
  claims: Record<string, unknown> = {},
  signingKey = privateKey,
) {
  return new SignJWT({
    sub: "fixture-operator",
    email: OPERATOR_EMAIL,
    type: "app",
    iat: now - 10,
    exp: now + 300,
    iss: issuer,
    aud: [audience],
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .sign(signingKey);
}
function headers(value?: string) {
  const h = new Headers({ host: "musclememory.run" });
  if (value) h.set("cf-access-jwt-assertion", value);
  return h;
}
const signed = await token();
test("only configured team issuer and exact app AUD are accepted as configuration", () => {
  assert.deepEqual(
    adminConfig({ ADMIN_ACCESS_ISSUER: issuer, ADMIN_ACCESS_AUD: audience }),
    config,
  );
  for (const env of [
    {},
    {
      ADMIN_ACCESS_ISSUER: "https://attacker.test",
      ADMIN_ACCESS_AUD: audience,
    },
    { ADMIN_ACCESS_ISSUER: issuer, ADMIN_ACCESS_AUD: "" },
    { ADMIN_ACCESS_ISSUER: `${issuer}/extra`, ADMIN_ACCESS_AUD: audience },
  ])
    assert.throws(() => adminConfig(env));
});
test("allowed signed identity; no token/email is returned", async () => {
  assert.deepEqual(await authorizeAdmin(headers(signed), config, getKey), {
    subject: "fixture-operator",
  });
});
test("anonymous, spoofed email and malformed assertions fail closed", async () => {
  const spoof = headers();
  spoof.set("cf-access-authenticated-user-email", OPERATOR_EMAIL);
  for (const h of [
    headers(),
    spoof,
    headers("garbage"),
    headers("x".repeat(16385)),
  ])
    await assert.rejects(authorizeAdmin(h, config, getKey));
});
for (const [name, claims] of Object.entries({
  "wrong email": { email: "other@example.com" },
  "email case variant": { email: OPERATOR_EMAIL.toUpperCase() },
  "wrong issuer": { iss: "https://attacker.cloudfareaccess.com" },
  "wrong audience": { aud: "b".repeat(64) },
  expired: { exp: now - 1 },
  "future not-before": { nbf: now + 120 },
  "future issued-at": { iat: now + 60 },
  "missing expiry": { exp: undefined },
  "missing subject": { sub: undefined },
  "service identity": { type: "service" },
  "missing type": { type: undefined },
}))
  test(`rejects ${name}`, async () => {
    await assert.rejects(
      authorizeAdmin(headers(await token(claims)), config, getKey),
    );
  });
test("bad signature and unavailable signing keys fail closed", async () => {
  const other = await generateKeyPair("RS256");
  await assert.rejects(
    authorizeAdmin(headers(await token({}, other.privateKey)), config, getKey),
  );
  await assert.rejects(
    authorizeAdmin(headers(signed), config, async () => {
      throw new Error("JWKS unavailable");
    }),
  );
});
test("unsigned and HS256 tokens cannot substitute for an RS256 Access assertion", async () => {
  const hs = await new SignJWT({
    sub: "operator",
    email: OPERATOR_EMAIL,
    iss: issuer,
    aud: audience,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new Uint8Array(32));
  for (const value of [hs, `${signed.split(".").slice(0, 2).join(".")}.`])
    await assert.rejects(authorizeAdmin(headers(value), config, getKey));
});
test("valid token cannot grant alternate host or conflicting forwarded authority", async () => {
  for (const host of [
    "localhost",
    "muscle-memory.example.workers.dev",
    "musclememory.run.attacker.test",
    "musclememory.run:443",
  ]) {
    const h = headers(signed);
    h.set("host", host);
    await assert.rejects(authorizeAdmin(h, config, getKey));
  }
  const h = headers(signed);
  h.set("x-forwarded-host", "attacker.test");
  await assert.rejects(authorizeAdmin(h, config, getKey));
});
test("admin classifier catches encoded, case, slash and RSC aliases", () => {
  for (const path of [
    "/admin",
    "/admin/authoring",
    "/admin/api/catalog",
    "/%61dmin",
    "/%2561dmin",
    "/admin%2fapi/catalog",
    "/ADMIN",
    "//admin/api",
    "/admin.rsc",
    "/api/admin/catalog",
    "/admin%5capi/catalog",
  ])
    assert.equal(isAdminPath(path), true, path);
  for (const path of [
    "/",
    "/challenges",
    "/ingest/practice",
    "/administrator",
    "/r/x",
    "/settings",
  ])
    assert.equal(isAdminPath(path), false, path);
  assert.throws(() => isAdminPath("/%E0%A4%A"));
});
function mutation(
  origin: string | null,
  site = "same-origin",
  url = "https://musclememory.run/admin/api/test",
  method = "POST",
) {
  const h = headers(signed);
  if (origin) h.set("origin", origin);
  h.set("sec-fetch-site", site);
  return new Request(url, { method, headers: h });
}
test("mutations require canonical same-origin, not just a signed token", () => {
  assert.doesNotThrow(() =>
    requireAdminMutationOrigin(mutation("https://musclememory.run")),
  );
  for (const request of [
    mutation(null),
    mutation("null"),
    mutation("https://evil.test"),
    mutation("https://musclememory.run", "cross-site"),
    mutation("https://musclememory.run", "same-site"),
    mutation(
      "https://musclememory.run",
      "same-origin",
      "https://preview.workers.dev/admin/api/test",
    ),
    mutation("https://musclememory.run", "same-origin", undefined, "GET"),
  ])
    assert.throws(() => requireAdminMutationOrigin(request));
});
test("audit primitive stops unauthorized/cross-site calls and pre-audit failure, records safe outcomes", async () => {
  const target = {
    action: "challenge.publish" as const,
    challenge: "PY-001",
    revision: `sha256:${"b".repeat(64)}`,
  };
  const authorize = (h: Headers) => authorizeAdmin(h, config, getKey);
  let calls = 0;
  const records: unknown[] = [];
  const sink = {
    write: async (r: unknown) => {
      records.push(r);
    },
  };
  await assert.rejects(
    auditedAdminMutation(
      mutation("https://evil.test"),
      target,
      authorize,
      sink,
      async () => ++calls,
    ),
  );
  await assert.rejects(
    auditedAdminMutation(
      mutation("https://musclememory.run"),
      target,
      authorize,
      {
        write: async () => {
          throw new Error("unavailable");
        },
      },
      async () => ++calls,
    ),
  );
  assert.equal(calls, 0);
  assert.equal(
    await auditedAdminMutation(
      mutation("https://musclememory.run"),
      target,
      authorize,
      sink,
      async () => ++calls,
    ),
    1,
  );
  assert.deepEqual(
    records.map((r) => (r as { result: string }).result),
    ["started", "succeeded"],
  );
  assert.ok(!JSON.stringify(records).includes(signed));
  assert.ok(!JSON.stringify(records).includes(OPERATOR_EMAIL));
  records.length = 0;
  await assert.rejects(
    auditedAdminMutation(
      mutation("https://musclememory.run"),
      target,
      authorize,
      sink,
      async () => {
        throw new Error("secret");
      },
    ),
  );
  assert.deepEqual(
    records.map((r) => (r as { result: string }).result),
    ["started", "failed"],
  );
  assert.ok(!JSON.stringify(records).includes("secret"));
});
