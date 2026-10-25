# The incident

One playable production incident, the home page's hook: "Production is down. AI is down. You're on call." Kettlebrook, a fictional homeware shop, leans on AI tools; tonight `checkout-api` fails guest orders while those tools are unavailable. The outage is a routine human regression (a members-only free-shipping change, CHK-412, that reads a loyalty record guests don't have); AI being down is only the constraint. Nothing here claims what AI does to people.

## Content

`INC-1` (`checkout-guest-shipping`) in the unlisted `INC` project, seed data like every issue (`content/seed.ts`). JavaScript, several files: `src/checkout/quote.js` to edit, read-only `shipping.js` and `money.js`, `logs/checkout-api.log` (plain text, with the stack trace pointing at `quote.js:11:41`), `RUNBOOK.md`, and a test file whose named regression case is order #88213 from the log. Three hidden cases catch the tempting wrong fixes (`loyalty?.tier !== "none"` treats guests as members; a guest early return that skips shipping). A blocking review comment fires on a `catch` in `quote.js`.

Teammates speak only when the person does something (`docs/issue-model.md`, triggers): opening the log (`opened`), a local run where the regression fails or passes (`ran`), opening the pull request, a case passing in CI. Hints follow runs or pushes without progress. No line fires on a clock. The IDE shows what was just said in its bottom panel, in place, with a link to the ticket's thread.

## The flow

1. `/` → **Take the incident** → `/incident`: the page, what happens next, and the Terms accepted explicitly (the four points from `/consent`, a box to tick, then **Acknowledge the page**). A cookie alone is not enough: without a current acceptance stored in this browser, the box is asked again.
2. Acknowledging records `arrived` and a start-work board move naming the revision played, then opens `/work/INC-1?revision=sha256:…`.
3. The IDE as usual: run tests, open a pull request, CI, review, merge on `/pulls/INC-1/<n>`.
4. After merging, the pull request page offers **Deploy to production**: a simulated deploy (nothing leaves the browser), recorded as `observation.board.deployed` with the pull request and run. Its steps are read from the merged push's checks.
5. `/incident/report`: filed only for the latest attempt whose merged push passed every check and was then deployed; visiting a page never counts. Everything on it comes from that attempt's records (timeline, the team lines actually released, the result-card numbers, wall clock from acknowledging to deploying, active time); the story lines are labelled as the fictional company's.
6. **Page a friend**: a `/r/<card>` link whose card carries the incident version (`iv`), the attempt (`a`) and wall-clock seconds (`e`). It leads to `/incident?ref=…&v=<version>`.

## Versions

The incident's version is the revision played, shown as its first 8 hex digits. A link's `v` resolves to exactly one published revision of INC-1 (`resolveVersion` in `apps/web/lib/incident.ts`) or to none, which the page says rather than silently using the latest. `/work/INC-1?revision=` accepts only INC-1's published revisions (others are 404). An attempt stays on the revision its start or replay move named: the IDE redirects to it if the URL says otherwise. The catalog keeps every published revision; don't prune INC-1's while links to it exist.

## Attempts and replays

A done incident can be replayed on purpose from `/incident`, after a confirmation that says what a replay is. The replay is a board move from Done to In progress with `trigger: "replay"` (board capture 7.0.0) and starts a new attempt (`apps/web/lib/attempts.ts`): code restore, teammate feedback, which pull request may merge, the result's numbers and the deploy and report gates all read that attempt's records only. Nothing earlier is deleted; code changed after an earlier merge stays recorded with that attempt. Pull request numbers continue across attempts. The report says "First response" or "Replay n"; analysis tells them apart by the replay moves.
