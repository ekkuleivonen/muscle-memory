import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSENT_VALUE,
  hasConsent,
  issuesFor,
  nextQuestion,
  pathWithQuery,
  PROFILE_VERSION,
  safeNext,
  SNOOZE_MS,
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

test("issues are filtered to the chosen stack", () => {
  assert.equal(
    issuesFor({ languages: ["python", "rust"] }),
    "/issues?q=lang%3Apython%2Crust",
  );
  assert.equal(issuesFor({}), "/issues");
});

test("a page's own path and query survive the round trip through /consent", () => {
  const path = pathWithQuery("/issues", {
    language: ["go", "rust"],
    q: "log parser",
    none: undefined,
  });
  assert.equal(path, "/issues?language=go&language=rust&q=log+parser");
  assert.equal(safeNext(path, "/"), path);
  assert.equal(pathWithQuery("/projects", {}), "/projects");
});

const NOW = Date.parse("2026-10-25T12:00:00Z");
const stored = (rest: Partial<StoredProfile>): StoredProfile => ({
  version: PROFILE_VERSION,
  createdAt: "2026-10-25T00:00:00Z",
  profile: {},
  ...rest,
});
const ALL = ["experience", "aiUse", "languages", "goal"] as const;

test("questions are asked in order, skipping the answered ones", () => {
  assert.equal(nextQuestion(stored({}), ALL, NOW), "experience");
  assert.equal(
    nextQuestion(stored({ profile: { experience: "veteran", aiUse: "daily" } }), ALL, NOW),
    "languages",
  );
  assert.equal(nextQuestion(null, ALL, NOW), null);
});

test("the five-minute test's language is a guess, so languages stays open until answered", () => {
  const guessed = stored({ profile: { languages: ["python"] } });
  assert.equal(nextQuestion(guessed, ["languages"], NOW), "languages");
  const answered = stored({
    profile: { languages: ["python", "go"] },
    asked: { languages: { answeredAt: "2026-10-25T10:00:00Z" } },
  });
  assert.equal(nextQuestion(answered, ["languages"], NOW), null);
});

test("not now puts a question off until the snooze ends, everywhere", () => {
  const until = new Date(NOW + SNOOZE_MS).toISOString();
  const snoozed = stored({ asked: { experience: { snoozedUntil: until } } });
  assert.equal(nextQuestion(snoozed, ALL, NOW), "aiUse");
  assert.equal(nextQuestion(snoozed, ["experience"], NOW), null);
  assert.equal(nextQuestion(snoozed, ["experience"], NOW + SNOOZE_MS + 1), "experience");
});
