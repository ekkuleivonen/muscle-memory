/**
 * Acceptance for human comparisons, end to end on synthetic data only:
 *   20 browsers' real capture trace → the shipped member SQL (run in SQLite behind a stand-in for
 *   the Basin endpoint) → CONTROL checks → private snapshot (≤ 1 hour) → the on-demand
 *   `/api/cohort` read → the Stats bridge → the rendered report,
 * with the viewer's attempts from the real producer (capture trace → localHistory). No player data,
 * no live Basin, CONTROL or R2; their adapters are in-memory stand-ins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trace } from "../../../../packages/developer-profile/fixtures";
import { localHistory } from "../../../../packages/developer-profile/history";
import { revisionId } from "../../../../packages/content/revision";
import { engineFor } from "../../../../packages/runner/engines";
import { many, type Event } from "../../../../packages/statistics/cohort-fixtures";
import { humanEnvironment, onRevision } from "../../../../packages/statistics/human-acceptance-fixture";
import { humanSummaryOnRequest } from "../../../../packages/statistics/scheduled-cohorts";
import type { CohortRead } from "../../../../packages/statistics/cohort";
import { buildReport, type ReportAttempt } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import type { StoredProfile } from "../../lib/profile";
import { comparisonRequests, comparisons, pairKey } from "./comparisons";
import { ReportBody } from "./stats";

const runtime = engineFor("javascript")!.runtime;
const source = {
  challenge: "JS-001",
  language: "javascript",
  task: "Synthetic identity.",
  file: "synthetic.js",
  starter: "",
  entrypoint: "identity",
  cases: [{ id: "example", input: 1, expected: 1, hidden: false }],
  rules: [],
};
const revision = revisionId(source as never);
const now = new Date("2026-10-28T00:00:00.000Z");
const catalog = [
  { key: "JS-001", revision, title: "Synthetic Sum", language: "javascript", difficulty: "easy", tags: [], runnable: true },
] as unknown as ChallengeSummary[];
const adult = { version: "2", createdAt: "2026-10-20T00:00:00Z", stealth: false, profile: { age: "25-34" } } as unknown as StoredProfile;

const browsers = (n: number, prefix = "b"): Event[] => many(n, prefix).map((e) => onRevision(e, revision, runtime));

/** The viewer's own attempts, from the real producer: their capture records through localHistory. */
const viewerAttempts = (): ReportAttempt[] =>
  localHistory({
    settings: { participantId: "synthetic-participant" },
    records: trace("viewer-attempt", "viewer-source", "JS-001", revision).map((r) => onRevision(r, revision, runtime)),
    outbox: [],
  }).map((a) => ({ ...a, source: "device" as const }));

function environment(events: Event[], excluded: Set<string> = new Set()) {
  const f = humanEnvironment({
    events,
    excluded,
    challenge: "JS-001",
    revision,
    source,
    metadata: { key: "JS-001", title: "Synthetic Sum", summary: "Fixture", difficulty: "easy", tags: [], revision },
    runtime,
  });
  /** One `/api/cohort` request: the read it answers, after letting its background build finish. */
  const request = async (at = now) => {
    const work: Promise<unknown>[] = [];
    const read = await f.request(at, (w) => work.push(w));
    return { read, built: await Promise.all(work) };
  };
  return { ...f, request, get queries() { return f.queries; } };
}

/** What Stats shows for these reads, through the real bridge and report. */
function stats(read: CohortRead | null) {
  const attempts = viewerAttempts();
  const requests = comparisonRequests(attempts, catalog);
  const key = pairKey({ challenge: "JS-001", revision });
  const c = comparisons(attempts, catalog, adult, requests, {
    cohorts: read ? { [key]: read } : { [key]: "unavailable" },
    receipts: {},
    lengths: {},
  });
  const report = buildReport({ catalog, progress: {}, attempts, profile: adult.profile, comparisons: c });
  return { requests, c, report, html: renderToStaticMarkup(createElement(ReportBody, { report, status: null })) };
}

test("producer → 20 eligible browsers → cache → /api/cohort → Stats shows one named line", async () => {
  process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1"; // the bridge's dev-only switch; the build flag stays off
  const f = environment(browsers(20));
  try {
    const attempts = viewerAttempts();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].practice, "unknown", "the producer never claims a first attempt");
    // First request: a miss answers at once with nothing, and one bounded build runs afterwards.
    const first = await f.request();
    assert.equal(first.read, null);
    assert.deepEqual(first.built, [true]);
    assert.equal(f.queries, 1, "one member query");
    // Next request: served from the private snapshot, no SQL.
    const second = await f.request();
    assert.equal(second.read?.state, "ready");
    assert.equal(f.queries, 1);
    const s = stats(second.read);
    assert.deepEqual(s.requests.cohorts, [{ challenge: "JS-001", revision }]);
    assert.equal(s.c.human.state, "shown");
    assert.match(
      s.html,
      /Among first attempts at Synthetic Sum \(current version, same runtime and editor setup\) from 20–49 browsers, about \d+% of scored first submissions passed\./,
    );
    // Aggregate only, in storage and in the response.
    for (const v of [JSON.stringify(second.read), ...[...f.objects.values()].map((o) => o.text)])
      assert.doesNotMatch(v, /participant_id|"b\d+"|synthetic-token/);
  } finally {
    f.close();
  }
});

test("one build per revision per hour, across concurrent requests; a failed hour isn't retried", async () => {
  const f = environment(browsers(20));
  try {
    const [a, b] = await Promise.all([f.request(), f.request()]);
    assert.deepEqual([...a.built, ...b.built].sort(), [false, true], "only one claimant builds");
    assert.equal(f.queries, 1);
  } finally {
    f.close();
  }
  const g = environment(browsers(19));
  try {
    await g.request();
    await g.request();
    assert.equal(g.queries, 1, "19 browsers: no snapshot, and no second query this hour");
    assert.equal(stats((await g.request()).read).c.human.state, "omitted");
  } finally {
    g.close();
  }
});

test("fail closed: CONTROL exclusion, invalidation after a privacy change, and expiry", async () => {
  process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1";
  const excluded = environment(browsers(20), new Set(["b0"]));
  try {
    await excluded.request();
    const r = await excluded.request();
    const s = stats(r.read);
    assert.deepEqual([s.c.human.state, (s.c.human as any).reason], ["omitted", "too-few"]);
    assert.doesNotMatch(s.html, /Among first attempts/);
  } finally {
    excluded.close();
  }
  const f = environment(browsers(20));
  try {
    await f.request();
    assert.equal((await f.request()).read?.state, "ready");
    // An acknowledged privacy change: the old snapshot is never served again.
    f.advance();
    const after = await f.request();
    assert.equal(after.read, null);
    assert.equal(stats(after.read).c.human.state, "omitted");
    // ...but a rebuild for the new generation runs within the same hour, so the line comes back
    // instead of the whole hour going dark after one player's privacy save.
    assert.deepEqual(after.built, [true]);
    assert.equal((await f.request()).read?.state, "ready");
    assert.equal(f.queries, 2);
    // Older than an hour: not served; within the same hour no second build runs.
    const key = [...f.objects.keys()].find((k) => k.includes("/humans/") && !k.includes("/leases/"))!;
    const snap = JSON.parse(f.objects.get(key)!.text);
    snap.computedAt = new Date(Date.now() - 3_600_001).toISOString();
    snap.expiresAt = new Date(Date.now() - 1).toISOString();
    f.objects.set(key, { text: JSON.stringify(snap), etag: "stale" });
    assert.equal((await f.request()).read, null);
  } finally {
    f.close();
  }
});

test("a slower build of an older generation never replaces a newer generation's snapshot", async () => {
  const f = environment(browsers(20));
  try {
    // G1's build stalls in its member query; meanwhile a privacy save advances to G2.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let calls = 0;
    const slowFirst: typeof fetch = async (url, init) => {
      if (++calls === 1) await held;
      return f.basin(url, init);
    };
    const g1: Promise<unknown>[] = [];
    assert.equal(await humanSummaryOnRequest(f.env, "JS-001", revision, runtime, (w) => g1.push(w), now, slowFirst), null);
    f.advance();
    // G2's rebuild runs and stores a valid snapshot.
    const g2: Promise<unknown>[] = [];
    assert.equal(await humanSummaryOnRequest(f.env, "JS-001", revision, runtime, (w) => g2.push(w), now, slowFirst), null);
    assert.deepEqual(await Promise.all(g2), [true]);
    const key = [...f.objects.keys()].find((k) => k.includes("/humans/") && !k.includes("/leases/"))!;
    const g2Snapshot = f.objects.get(key)!.text;
    // Now the slow G1 build finishes: it must not write over G2.
    release();
    assert.deepEqual(await Promise.all(g1), [false]);
    assert.equal(f.objects.get(key)!.text, g2Snapshot, "G2's snapshot stays");
    assert.equal((await f.request()).read?.state, "ready", "and is served");
  } finally {
    f.close();
  }
});
