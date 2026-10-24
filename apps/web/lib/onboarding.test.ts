import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnboarded,
  issuesFor,
  ONBOARDING_VERSION,
  pathWithQuery,
  safeNext,
} from "./onboarding";

test("only the current setup version counts as onboarded", () => {
  assert.equal(isOnboarded(ONBOARDING_VERSION), true);
  assert.equal(isOnboarded(undefined), false);
  assert.equal(isOnboarded("0"), false);
});

test("next only ever leads to a path on this site, never back to onboarding", () => {
  const fallback = "/issues";
  assert.equal(
    safeNext("/issues/frequency-map?version=2.1.0", fallback),
    "/issues/frequency-map?version=2.1.0",
  );
  assert.equal(safeNext("/categories#top", fallback), "/categories#top");
  for (const bad of [
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "issues",
    "/onboarding?next=/issues",
    "",
    undefined,
    ["/issues"],
  ])
    assert.equal(safeNext(bad, fallback), fallback, String(bad));
});

test("after onboarding, issues are filtered to the chosen stack", () => {
  assert.equal(
    issuesFor({ languages: ["python", "rust"] }),
    "/issues?q=lang%3Apython%2Crust",
  );
  assert.equal(issuesFor({}), "/issues");
});

test("a page's own path and query survive the round trip through onboarding", () => {
  const path = pathWithQuery("/issues", {
    language: ["go", "rust"],
    q: "log parser",
    none: undefined,
  });
  assert.equal(path, "/issues?language=go&language=rust&q=log+parser");
  assert.equal(safeNext(path, "/"), path);
  assert.equal(pathWithQuery("/categories", {}), "/categories");
});
