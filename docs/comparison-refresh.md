# Background comparison refresh — unconfigured draft

The question-based personal report continues to render device evidence immediately. This draft adds only model-metadata precomputation; human comparisons remain disabled and require ENG-376's current-privacy protocol. No new service, token, database, model execution or event is introduced.

## Proposed activation, not applied

Use the existing web Worker's supported OpenNext custom-worker entry point, `apps/web/custom-worker.ts`. After review/approval, change Wrangler `main` to `custom-worker.ts`, add hourly UTC trigger `7 * * * *`, and set `MODEL_SUMMARY_CACHE_ENABLED=true`. The same flag controls serving snapshots. Existing CATALOG_DB and private CONTENT bindings suffice. Removing the trigger and flag stops refresh and restores the existing read path; stored snapshots may remain private. No Mac/dev-01 daemon.

The scheduled handler reads at most 100 published revision keys and the existing fixed model ledger/allowlisted receipt reader, sequentially. It never queries raw human events. Only code-free receipt projections go to `comparison-summaries/models/model-summary-1/` in CONTENT. Each snapshot expires after two hours; no page-load raw fallback when snapshot mode is enabled. No model benchmark is run. Missing/expired snapshots simply supply no comparison FYI.

Per invocation: 45-second refresh budget, five seconds per receipt read, at most 250 private receipt-object GET attempts and 32 MiB declared object bytes, at most 100 snapshot writes of at most 128 KiB. Starting revision rotates hourly to avoid starving later challenges. Failed/incomplete reads retain the previous snapshot, which still expires normally. These are invocation limits, not an account-wide cost cap or exactly-once scheduler guarantee. At one invocation/hour, ceiling is 180,000 receipt GET attempts and 23 GiB declared receipt bytes in 30 days, plus catalog/ledger reads and up to 72,000 snapshot writes. Actual use depends on existing model results; no free-allowance claim. Config flag/trigger are the stop mechanism.

The human cache cannot reuse this model TTL policy: a current opt-out/deletion must invalidate eligible membership independently of the hourly computation. PR73 owns that control protocol and matching/denominator correctness. Until its publication semantics and native Basin JSON are verified and the exact live control/RPC changes approved, no human snapshot is published or served. A frozen global aggregate alone cannot remove one excluded contributor safely.

Official implementation references: [OpenNext custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker), [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/). Trigger changes can take up to 15 minutes to propagate.
