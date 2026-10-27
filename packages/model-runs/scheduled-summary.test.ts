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
