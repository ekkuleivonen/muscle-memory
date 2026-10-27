import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSENT_VALUE,
  updateProfileAnswers,
  reportProfile,
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
    safeNext("/challenges?q=lang%3Apython", fallback),
    "/challenges?q=lang%3Apython",
  );
  assert.equal(safeNext("/challenges#top", fallback), "/challenges#top");
  for (const bad of [
    undefined,
    42,
    "challenges",
    "//evil.example/x",
    "https://evil.example/",
    "/consent?next=/challenges",
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

test("editing one field never promotes a quick-start guess or overwrites other-tab answers", () => {
  const before = stored({
    profile: { languages: ["python"], role: "data", age: "25-34" },
    asked: { age: { answeredAt: "earlier" } },
  });
  const next = updateProfileAnswers(
    before,
    { languages: ["python"], role: "software", age: "18-24" },
    ["role"],
    "now",
  );
  assert.deepEqual(next.profile, {
    languages: ["python"],
    role: "software",
    age: "25-34",
  });
  assert.equal(next.asked?.languages, undefined);
  assert.deepEqual(next.asked?.age, before.asked?.age);
  assert.deepEqual(next.asked?.role, { answeredAt: "now" });
  assert.equal(reportProfile(next).languages, undefined);
});

test("no-op save does not manufacture answer provenance; explicitly confirming a guess does", () => {
  const before = stored({ profile: { languages: ["python"] } });
  assert.deepEqual(
    updateProfileAnswers(before, before.profile, [], "now").asked,
    {},
  );
  const next = updateProfileAnswers(
    before,
    before.profile,
    ["languages"],
    "now",
  );
  assert.deepEqual(reportProfile(next).languages, ["python"]);
});

test("clearing scalar and multiselect answers removes values and markers but preserves consent and stealth", () => {
  const before = stored({
    profile: { languages: ["python"], age: "25-34", role: "data" },
    asked: { age: { answeredAt: "old" }, languages: { answeredAt: "old" } },
    stealth: true,
  });
  const next = updateProfileAnswers(
    before,
    { languages: [] },
    ["languages", "age"],
    "now",
  );
  assert.deepEqual(next.profile, { role: "data" });
  assert.deepEqual(next.asked, {});
  assert.equal(next.stealth, true);
  assert.equal(next.createdAt, before.createdAt);
  assert.deepEqual(before.profile.languages, ["python"]);
});
