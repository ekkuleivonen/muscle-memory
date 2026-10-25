# ENG-328 current verification scope

The previous PR/workplace flow is superseded. Stale screenshots have been removed; their original commits remain in Git history. Do not use them to represent the proposed practice experience. A real updated practice screenshot will be supplied when the lean UI exists.

The [current lean contract](eng-328-lean-contract.md) records dot’s decisions: deterministic correctness and safety block completion without manual Resolve; hidden expected outputs/solutions remain hidden; public requirements and example feedback remain clear. No capture/persistence gate is approved by presentation changes.

`npm test` and `npx tsc --noEmit -p apps/web` cover the existing logic and new transcript redaction tests. `LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/challenge-presentation-check.ts` checks explore, challenge examples, keyboard focus/save/resume and mobile layout. `tools/browser/loop-check.ts` is a historical compatibility regression, not acceptance of the new completion flow.

The published catalog, runtime, capture schema, collection, legal documents and consent are unchanged. No migration, merge or deployment is performed.

Current integrated unit result: 226 passed, 0 failed, including hidden sentinel rendering tests. Web typecheck passes. Production build and browser checks are rerun against the integrated presentation before handoff. No screenshot of the proposed lean practice UI exists yet.
