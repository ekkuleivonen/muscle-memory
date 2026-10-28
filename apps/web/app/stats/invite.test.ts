import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InviteCopy, LANGUAGES_FORM, ReportBody } from "./stats";
import { buildReport } from "../../lib/report";
import { DISMISSED_KEY, dismiss, readDismissed } from "../../lib/invitations";
import { guesses, reportProfile, updateProfileAnswers, type StoredProfile } from "../../lib/profile";
import { deriveAttempts } from "../../../../packages/developer-profile/derive";
import { trace, syntheticRevision } from "../../../../packages/developer-profile/fixtures";
import type { ChallengeSummary } from "../../lib/challenges";

const catalog = [
  { key: "JS-001", title: "Synthetic", language: "javascript", tags: ["arrays"], difficulty: "easy", runnable: true, revision: syntheticRevision },
] as unknown as ChallengeSummary[];
const attempts = deriveAttempts(trace("a", "a-source", "JS-001"), "synthetic-participant").map((a) => ({ ...a, source: "device" as const }));
const guessed: StoredProfile = {
  version: "2",
  createdAt: "2026-10-28T00:00:00Z",
  profile: { languages: ["python"], editor: "vim" },
  asked: { editor: { answeredAt: "2026-10-27T00:00:00Z" } },
};
const report = (stored: StoredProfile) =>
  buildReport({ catalog, progress: {}, attempts, profile: reportProfile(stored), receipts: {} });

function memory(fail?: "read" | "write") {
  const map = new Map<string, string>();
  return {
    map,
    getItem(key: string) {
      if (fail === "read") throw new Error("SecurityError");
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (fail === "write") throw new Error("QuotaExceededError");
      map.set(key, value);
    },
  };
}

test("an unconfirmed quick-start guess is named as a guess and leaves the report ungrouped", () => {
  const r = report(guessed);
  assert.equal(r.languagesInvite, true);
  assert.equal(r.questions.find((q) => q.id === "familiarity"), undefined);
  assert.deepEqual([...guesses(guessed)], ["languages"], "the answered editor isn't a guess");
  const html = renderToStaticMarkup(createElement(InviteCopy, { guess: ["Python"] }));
  assert.match(html, /Optional: Python is ticked from quick start, as a guess\. Confirm or change it/);
  assert.ok(html.includes(`href="${LANGUAGES_FORM.replace("&", "&amp;")}"`));
  assert.match(html, /Confirm your languages/);
  assert.match(html, /<button type="button" class="t-cmd">Hide this<\/button>/);
  assert.match(html, /href="\/privacy"/);
  assert.doesNotMatch(html, /unlock|compare|cohort|similar|faster|better than|skill|proficien/i);
});

test("with no guess it asks plainly, and several guesses read as a list", () => {
  assert.match(renderToStaticMarkup(createElement(InviteCopy, { guess: [] })), /Say which languages you work with[\s\S]*Set your languages/);
  assert.match(renderToStaticMarkup(createElement(InviteCopy, { guess: ["Go", "C", "SQL"] })), /Go, C and SQL are ticked/);
});

test("confirming the guess answers only languages and unrelated answers keep their provenance", () => {
  const at = "2026-10-28T05:00:00Z";
  const untouched = updateProfileAnswers(guessed, guessed.profile, [], at);
  assert.equal(untouched.asked?.languages, undefined, "viewing or saving nothing never confirms");
  const confirmed = updateProfileAnswers(guessed, { languages: ["python"] }, ["languages"], at);
  assert.deepEqual(confirmed.profile, { languages: ["python"], editor: "vim" });
  assert.equal(confirmed.asked?.languages?.answeredAt, at);
  assert.equal(confirmed.asked?.editor?.answeredAt, "2026-10-27T00:00:00Z");
  assert.deepEqual([...guesses(confirmed)], []);
  const r = report(confirmed);
  assert.equal(r.languagesInvite, false, "answered: no invitation");
  assert.ok(r.questions.find((q) => q.id === "familiarity"), "answered: the grouping appears");
  const html = renderToStaticMarkup(createElement(ReportBody, { report: r, status: null }));
  assert.ok(html.includes("Edit your usual languages"), "later edit stays one link away");
  const cleared = updateProfileAnswers(confirmed, {}, ["languages"], at);
  assert.equal(cleared.profile.languages, undefined);
  assert.equal(cleared.asked?.languages, undefined, "clearing returns to unknown, not to a negative answer");
  assert.equal(report(cleared).languagesInvite, true, "unknown again, so the quiet invitation may return unless hidden");
});

test("the report body leaves the invitation to the client, after storage is read", () => {
  const html = renderToStaticMarkup(createElement(ReportBody, { report: report(guessed), status: null, guess: ["Python"] }));
  assert.doesNotMatch(html, /Hide this|ticked from quick start/, "nothing renders before the dismissal is read");
});

test("hiding is remembered on this device, and failing storage never throws", () => {
  const store = memory();
  assert.deepEqual([...readDismissed(store)], []);
  assert.equal(dismiss("languages", store), true);
  assert.deepEqual([...readDismissed(store)], ["languages"]);
  assert.equal(store.map.get(DISMISSED_KEY), '["languages"]');
  assert.equal(dismiss("languages", store), true, "idempotent");
  assert.equal(store.map.get(DISMISSED_KEY), '["languages"]');
  store.map.set(DISMISSED_KEY, "{not json");
  assert.deepEqual([...readDismissed(store)], [], "corrupt reads as nothing hidden");
  store.map.set(DISMISSED_KEY, '["languages","other",1]');
  assert.deepEqual([...readDismissed(store)], ["languages"]);
  assert.deepEqual([...readDismissed(memory("read"))], []);
  assert.equal(dismiss("languages", memory("write")), false, "the caller says it may show again");
});
