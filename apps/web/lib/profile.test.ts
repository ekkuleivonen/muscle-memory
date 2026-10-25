import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSENT_VALUE,
  hasConsent,
  PROFILE_VERSION,
  safeNext,
  type StoredProfile,
} from "./profile";

test("only the current Terms open the app", () => {
  assert.equal(hasConsent(CONSENT_VALUE), true);
  assert.equal(hasConsent("2020-01-01"), false);
  assert.equal(hasConsent(undefined), false);
});

test("next only ever leads to a path on this site, never back to /consent", () => {
  const fallback = "/dashboard";
  assert.equal(
    safeNext("/issues?q=lang%3Apython", fallback),
    "/issues?q=lang%3Apython",
  );
  assert.equal(safeNext("/projects#top", fallback), "/projects#top");
  for (const bad of [
    undefined,
    42,
    "issues",
    "//evil.example/x",
    "https://evil.example/",
    "/consent?next=/issues",
    "/\\evil.example",
  ])
    assert.equal(safeNext(bad, fallback), fallback, String(bad));
});

const NOW = Date.parse("2026-10-25T12:00:00Z");
const stored = (rest: Partial<StoredProfile>): StoredProfile => ({
  version: PROFILE_VERSION,
  createdAt: "2026-10-25T00:00:00Z",
  profile: {},
  ...rest,
});
const ALL = ["experience", "aiUse", "languages", "goal"] as const;
