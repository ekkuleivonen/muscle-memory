/** The on-demand human build's lease ordering and its time limit at every I/O stage. Synthetic only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { syntheticRevision } from "../developer-profile/fixtures";
import { claimLease, humanSummaryOnRequest, type HumanSummaryEnvironment } from "./scheduled-cohorts";

function bucket() {
  const objects = new Map<string, { text: string; etag: string }>();
  let etags = 0;
  return {
    objects,
    get: async (key: string) => {
      const o = objects.get(key);
      return o ? { size: o.text.length, etag: o.etag, text: async () => o.text } : null;
    },
    put: async (key: string, text: string, options?: { onlyIf: { etagMatches: string } | { etagDoesNotMatch: string } }) => {
      const held = objects.get(key);
      const onlyIf = options?.onlyIf as { etagMatches?: string; etagDoesNotMatch?: string } | undefined;
      if (onlyIf?.etagDoesNotMatch === "*" && held) return null;
      if (onlyIf?.etagMatches !== undefined && held?.etag !== onlyIf.etagMatches) return null;
      objects.set(key, { text, etag: `e${++etags}` });
      return {};
    },
  };
}

const G1 = "11111111-1111-1111-1111-111111111111",
  G2 = "22222222-2222-2222-2222-222222222222",
  G3 = "33333333-3333-3333-3333-333333333333",
  G4 = "44444444-4444-4444-4444-444444444444";

test("a lease is claimed once per hour and never overwritten by an earlier hour's late request", async () => {
  const b = bucket();
  const claims = [];
  for (const hour of [101, 100, 101]) claims.push(await claimLease(b, "lease", hour, G1));
  assert.deepEqual(claims, [true, false, false]);
  assert.equal(JSON.parse(b.objects.get("lease")!.text).hour, 101, "the newer hour stays");
  assert.equal(await claimLease(b, "lease", 100, G2), false, "an earlier hour never, even with a new generation");
  assert.equal(await claimLease(b, "lease", 102, G1), true, "a later hour claims it");
  // An unreadable, out-of-range or non-integer stored hour fails closed; so does a bad request.
  for (const stored of ["not json", '{"hour":"101"}', '{"hour":1.5}', '{"hour":-1}', "{}", '{"hour":200}', '{"hour":200,"generation":1,"builds":1}']) {
    b.objects.set("bad", { text: stored, etag: "x" });
    assert.equal(await claimLease(b, "bad", 200, G2), false, stored);
  }
  assert.equal(await claimLease(b, "other", -1, G1), false);
  assert.equal(await claimLease(b, "other", 1.5, G1), false);
  assert.equal(await claimLease(b, "other", 1, "not-a-generation"), false);
});

test("within an hour, a new privacy generation may rebuild, at most three builds in all", async () => {
  const b = bucket();
  assert.equal(await claimLease(b, "lease", 300, G1), true);
  assert.equal(await claimLease(b, "lease", 300, G1), false, "same generation: no second build");
  assert.equal(await claimLease(b, "lease", 300, G2), true, "after a privacy change: one rebuild");
  assert.equal(await claimLease(b, "lease", 300, G3), true, "third build");
  assert.equal(await claimLease(b, "lease", 300, G4), false, "never a fourth in the hour");
  assert.deepEqual(JSON.parse(b.objects.get("lease")!.text).generations, [G1, G2, G3]);
  assert.equal(await claimLease(b, "lease", 301, G4), true, "a new hour starts again");
});

test("each generation builds at most once an hour, even when generations alternate", async () => {
  const b = bucket();
  const claims = [];
  for (const g of [G1, G2, G1, G2]) claims.push(await claimLease(b, "lease", 400, g));
  assert.deepEqual(claims, [true, true, false, false]);
  for (const stored of ['{"hour":400}', '{"hour":400,"generations":[]}', '{"hour":400,"generations":["x"]}', `{"hour":400,"generations":["${G1}","${G2}","${G3}","${G4}"]}`]) {
    b.objects.set("bad", { text: stored, etag: "x" });
    assert.equal(await claimLease(b, "bad", 400, "55555555-5555-5555-5555-555555555555"), false, stored);
  }
});

const deferred = <T>() => {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
};
const tick = () => new Promise((r) => setTimeout(r, 20));
const runtime = { id: "javascript", version: "synthetic" };

/** A miss whose build stalls at one I/O stage; counts every call made after the stall. */
function stalled(stage: "lease-get" | "lease-text" | "d1" | "source-get" | "source-text") {
  const calls: string[] = [];
  const hold = deferred<unknown>();
  const leaseText = '{"hour":1,"generations":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]}';
  const source = { size: 10, etag: "s", text: () => (calls.push("source-text"), stage === "source-text" ? hold.promise : Promise.resolve("{}")) };
  const env: HumanSummaryEnvironment = {
    HUMAN_SUMMARY_CACHE_ENABLED: "true",
    ADMIN_STATS_SQL_TOKEN: "synthetic-token",
    CONTENT: {
      get: async (key: string) => {
        if (key.includes("/leases/")) {
          calls.push("lease-get");
          const lease = { size: leaseText.length, etag: "l", text: () => (calls.push("lease-text"), stage === "lease-text" ? hold.promise : Promise.resolve(leaseText)) };
          return (stage === "lease-get" ? hold.promise : Promise.resolve(lease)) as any;
        }
        if (key.startsWith("published/")) {
          calls.push("source-get");
          return (stage === "source-get" ? hold.promise : Promise.resolve(source)) as any;
        }
        return null; // no snapshot: a miss
      },
      put: async (key: string) => (calls.push(key.includes("/leases/") ? "lease-put" : "snapshot-put"), {}),
    },
    CATALOG_DB: {
      prepare: () => {
        const s: any = {
          bind: () => s,
          first: () => (calls.push("d1"), stage === "d1" ? hold.promise : Promise.resolve({
            challenge_key: "JS-001", revision: syntheticRevision, object_key: "published/x.json",
            metadata_json: "{}", published_at: "2026-10-01T00:00:00.000Z",
          })),
        };
        return s;
      },
    } as any,
    COMPARISON_ELIGIBILITY: {
      generation: async () => (calls.push("generation"), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
      check: async (ids: string[]) => (calls.push("check"), ids.map(() => null)),
      authorize: async () => (calls.push("authorize"), false),
    },
  };
  const request: typeof fetch = async () => (calls.push("sql"), Response.json({ success: true, result: { rows: [] } }));
  return { env, calls, hold, request, leaseText };
}

for (const stage of ["lease-get", "lease-text", "d1", "source-get", "source-text"] as const)
  test(`a build timed out at ${stage} starts no new I/O when the late reply arrives`, async () => {
    const s = stalled(stage);
    const work: Promise<unknown>[] = [];
    const read = await humanSummaryOnRequest(
      s.env,
      "JS-001",
      syntheticRevision,
      runtime,
      (w) => work.push(w),
      new Date(7_200_000), // hour 2: the stored lease (hour 1) can be claimed
      s.request,
      30,
    );
    assert.equal(read, null);
    assert.deepEqual(await Promise.all(work), [false], "timed out");
    const before = [...s.calls];
    // Release the stalled reply after the timeout: the build must not continue from it.
    s.hold.release(
      stage === "lease-get"
        ? { size: s.leaseText.length, etag: "l", text: async () => s.leaseText }
        : stage === "d1"
          ? { challenge_key: "JS-001", revision: syntheticRevision, object_key: "published/x.json", metadata_json: "{}", published_at: "2026-10-01T00:00:00.000Z" }
          : stage === "source-get"
            ? { size: 2, etag: "s", text: async () => "{}" }
            : stage === "lease-text"
              ? s.leaseText
              : "{}",
    );
    await tick();
    assert.deepEqual(s.calls, before, `no call after the timeout (issued I/O isn't cancelled, only never followed)`);
    assert.ok(!s.calls.includes("sql") && !s.calls.includes("snapshot-put") && !s.calls.includes("check"));
  });
