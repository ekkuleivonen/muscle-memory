import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduledModelSummaries,
  type SummaryEnvironment,
} from "./scheduled-summary";
const revision = `sha256:${"a".repeat(64)}`;
test("disabled scheduler touches no bindings; missing storage is honest", async () => {
  const env = {
    get CATALOG_DB(): never {
      throw new Error("must not access");
    },
  };
  assert.deepEqual(await scheduledModelSummaries(env, 0), {
    state: "disabled",
  });
  assert.deepEqual(
    await scheduledModelSummaries({ MODEL_SUMMARY_CACHE_ENABLED: "true" }, 0),
    { state: "unconfigured" },
  );
});
test("scheduled handler reads the active registry and writes only code-free snapshots", async () => {
  const writes: string[] = [];
  const sqls: string[] = [];
  const env: SummaryEnvironment = {
    MODEL_SUMMARY_CACHE_ENABLED: "true",
    CATALOG_DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async <T>() => {
            sqls.push(sql);
            return {
              results: (sql.includes("challenge_heads")
                ? [{ challenge: "JS-001", revision }]
                : []) as T[],
            };
          },
        }),
      }),
    },
    CONTENT: {
      get: async () => null,
      put: async (key, value) => {
        writes.push(key);
        const snapshot = JSON.parse(value);
        assert.deepEqual(snapshot.result.receipts, []);
        assert.equal(snapshot.revision, revision);
      },
    },
  };
  const result = await scheduledModelSummaries(env, 0);
  assert.equal(result.state, "finished");
  assert.ok("refreshed" in result && result.refreshed === 1);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].startsWith("comparison-summaries/models/"));
  assert.ok(sqls.every((sql) => !sql.includes("default.events")));
  assert.match(sqls[0], /lifecycle = 'published'/);
});
function launchEnv(count: number, withList = true) {
  const uploaded = new Map<string, Date>();
  let clock = 0;
  const rows = Array.from({ length: count }, (_, i) => ({
    challenge: `JS-${String(i + 1).padStart(3, "0")}`,
    revision,
  }));
  const env: SummaryEnvironment = {
    MODEL_SUMMARY_CACHE_ENABLED: "true",
    CATALOG_DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async <T>() => ({
            results: (sql.includes("challenge_heads") ? rows : []) as T[],
          }),
        }),
      }),
    },
    CONTENT: {
      get: async () => null,
      put: async (key) => {
        uploaded.set(key, new Date(Date.UTC(2026, 9, 27) + ++clock));
      },
      ...(withList
        ? {
            list: async ({ prefix }: { prefix: string }) => ({
              objects: [...uploaded].filter(([k]) => k.startsWith(prefix)).map(([key, at]) => ({ key, uploaded: at })),
              truncated: false,
            }),
          }
        : {}),
    },
  };
  return { env, uploaded };
}
test("141 current revisions: no global failure, at most 100 a run, the rest first next run", async () => {
  const { env, uploaded } = launchEnv(141);
  const first: any = await scheduledModelSummaries(env, 0);
  assert.equal(first.state, "finished");
  assert.deepEqual(
    [first.registered, first.attempted, first.refreshed, first.notRefreshed, first.complete, first.ordering],
    [141, 100, 100, 41, false, "stalest-first"],
  );
  const second: any = await scheduledModelSummaries(env, 3_600_000);
  assert.equal(second.refreshed, 100);
  assert.equal(uploaded.size, 141, "every revision written within two runs");
});
test("over 200 current revisions stops the model refresh rather than dropping some", async () => {
  const { env, uploaded } = launchEnv(201);
  assert.deepEqual(await scheduledModelSummaries(env, 0), { state: "catalog-limit" });
  assert.equal(uploaded.size, 0);
});
test("without a listing, hourly rotation moves a whole run's width and reaches every revision", async () => {
  const { env, uploaded } = launchEnv(141, false);
  const r: any = await scheduledModelSummaries(env, 0);
  assert.equal(r.ordering, "rotation");
  await scheduledModelSummaries(env, 3_600_000);
  assert.equal(uploaded.size, 141);
});
test("model poison frontier: revisions whose ledger read keeps failing can't starve healthy ones", async () => {
  const { env, uploaded } = launchEnv(141);
  const poison = new Set(Array.from({ length: 99 }, (_, i) => `JS-${String(i + 1).padStart(3, "0")}`));
  const prepare = env.CATALOG_DB!.prepare;
  env.CATALOG_DB = {
    prepare: (sql) => ({
      bind: (...params: unknown[]) => ({
        all: async <T>() => {
          if (sql.includes("model_runs") && poison.has(params[0] as string)) throw new Error("synthetic failure");
          return prepare(sql).bind(...params).all<T>();
        },
      }),
    }),
  };
  for (let run = 0; run < 36; run++) {
    const r: any = await scheduledModelSummaries(env, run * 3_600_000);
    assert.equal(r.attempted, r.refreshed + r.failed);
    assert.equal(r.complete, false);
  }
  // ceil(141 / 4) = 36 runs: every healthy revision has had a rotation turn.
  const written = new Set([...uploaded.keys()].map((k) => k.split("/").at(-2)));
  for (let i = 100; i <= 141; i++) assert.ok(written.has(`JS-${i}`), `JS-${i}`);
});
