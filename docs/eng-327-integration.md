# ENG-327 integrated challenge loop

This composition replaces the workplace/PR flow with a single editable entry, full-check feedback, recorded completion and a relevant next challenge. It includes ENG-329's final normalized catalog (`986772d`), ENG-328's one-entry/historical recovery (`c09be3a`), ENG-330's homepage (`340fbc5`), ENG-331's editorial inventory (`790fd6f`) and ENG-332's cutoff-correct outcome sharing (`13c54f9`). Worker-only contracts describe their individual branches; this document records the final composition.

## Integration changes

- Authored SQL schemas render as semantic tables. Inline formatting remains React text/elements, never raw HTML. A focusable overflow region contains wide tables on mobile.
- `shareCompletionProof` derives the completion and successful gate from one record snapshot. Sharing requires the exact completion run, revision and timestamp, confirmed current code, evaluated required rules, and an idle/recoverable state. Missing or blocked gates never use an empty required-rule list as proof. The practice mount also rejects stale code, local-only runs and a later passing run that did not produce the recorded completion.
- The UI shares the allowlisted v3 outcome, with optional code taken only from the completing artifact. Code opt-in starts unchecked on each opening. Historical v2 links and queued older board records retain their meaning. V3 sharing and automatic completion ship together in board capture 7.2; workspace capture stays unchanged. Ingest must deploy before the site.
- Browser verification uses fresh synthetic contexts, stealth exclusion and intercepted `/ingest/*` requests. Practice shortcuts use the host platform's Mod+Enter.

## Verification

- 264 tests; web and ingest typechecks; catalog consistency; two aggregate compatibility tests.
- Production build and real-browser practice, catalog/navigation and integration-share checks pass.
- Integration-share coverage includes a genuine first compile error followed by a passing completion (`f: null`), default exclusion/explicit opt-in/exact code, stale edits plus reload, fresh-recipient independence and actual DATA-6 table headers/cells at desktop/mobile widths.
- Practice checks include partial/failing checks, hidden-error/output privacy, cancellation/retry, public-only runs, required-rule recovery, immutable completion, profile, single-entry TypeScript/SQL, explicit historical recovery, keyboard and mobile.

The full catalog publish suite and exact-head CI are release checks, reported in the integration PR. Screenshots and scripted checks are synthetic QA, not a human usability study or evidence of AI's effects. No records were reset or deleted.
