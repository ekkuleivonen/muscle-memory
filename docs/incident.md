# The incident

One playable production incident, the home page's hook: "Production is down. AI is down. You're on call." Kettlebrook, a fictional homeware shop, leans on AI tools; tonight `checkout-api` fails guest orders while those tools are unavailable. The outage is a routine human regression (a members-only free-shipping change, CHK-412, that reads a loyalty record guests don't have); AI being down is only the constraint. Nothing here claims what AI does to people.

## Content

`INC-1` (`checkout-guest-shipping`) in the unlisted `INC` project, seed data like every issue (`content/more/incident-response.ts`). JavaScript, several files: `src/checkout/quote.js` and `src/checkout/shipping.js` are both the player's to change (the runner uses the player's text of both), `money.js` is read-only, plus `logs/checkout-api.log` (plain text, with the stack trace pointing at `quote.js:11:41`), `RUNBOOK.md`, and a test file whose named regression case is order #88213 from the log. There is no feature flag or rollback in the story: guests were already failing before the alert, and a newsletter at 02:00 brought enough of them to page.

CI checks behaviour only, through `quoteOrder`, with ten cases (boundaries at $30 and $50, guests and lapsed members), so a fix in `quote.js` alone and a design that moves the membership decision into `shipping.js` both pass. The seed's private part lists the reference (quote only), two alternatives (including the two-file design) and six plausible wrong fixes; `npm run check:publish` runs all of them in the browser sandbox: alternatives must pass every case, wrong fixes must fail at least one.

Three places, three kinds of text:

- **The ticket's thread** holds clues from the start (Kai on the newsletter traffic, Bea on who is complaining, Tomasz on where CHK-412 lives). Nothing more is released into it except behaviour-triggered hints. No reply is needed.
- **The pull request** gets only actionable findings: failing CI checks, and review findings (a blocking one for a `catch` that hides the crash, a nit for hard-coded thresholds in `quote.js`). A push whose checks fail opens a **CI finding** on its pull request (`ciFindings: "explicit"`, derived from the push records): the check run itself stays as recorded, and the finding is the person's to resolve, whether after a later push passes or while CI is still red. One CI finding is open at a time; after it is resolved, the next failing push opens a new one, and a passing push never opens or resolves one. Merging needs the latest push's checks to pass and every finding resolved: resolving never satisfies CI. Both review findings need an explicit **Resolve** (`resolve: "explicit"`): a push that fixes the code, or a reply, leaves them open, and there is no reply box. A resolved finding the code still triggers opens again on the next push, and CI stays its own requirement. See [the IDE](workspace.md) for Findings and Resolve.
- **The team chat** is the workplace around the work: one small overlay that follows the person everywhere once they have started the incident: every tracker page (dashboard, board, issues, pull requests, through `IncidentChat` in the browse layout), the IDE and the report (`TeamChat`), with the same lines and unread state on each. Away from the IDE it reads the records again when the board changes, the window regains focus and every five seconds, so lines released elsewhere arrive. Its lines carry no clues; each appears after a recorded action (the attempt starting, opening the log, a local run, opening a pull request, a case passing in CI, merging), never on a clock. What it shows is a pure function of the attempt's records (`chatOf`), so it is not recorded separately; opening and closing the chat is not recorded. It never opens by itself or takes the focus: new lines light an unread dot (kept per attempt in `localStorage`), Escape or Close returns the focus where it was, and nothing in it needs an answer.

## The flow

1. `/` → **Take the incident** → `/incident`: the page, what happens next, and the Terms accepted explicitly (the four points from `/consent`, a box to tick, then **Acknowledge the page**). A cookie alone is not enough: without a current acceptance stored in this browser, the box is asked again.
2. Acknowledging records `arrived` and a start-work board move naming the revision played, then opens `/work/INC-1?revision=sha256:…`.
3. The IDE as usual: run tests, open a pull request, CI, review, merge on `/pulls/INC-1/<n>`.
4. Merging a pull request whose checks all pass resolves the incident: in the story main ships itself, and the pull request page says so plainly (Kettlebrook is fictional; nothing real is deployed). Nothing beyond the merge is recorded, and no deploy is asked of the person.
5. `/incident/report`: filed only for the latest attempt whose merged push passed every check; visiting a page never counts. Everything on it comes from that attempt's records (timeline, the chat lines that attempt reached, the result-card numbers, wall clock from acknowledging to merging, active time); the story lines are labelled as the fictional company's.
6. **Page a friend**: a `/r/<card>` link whose card carries the incident version (`iv`), the attempt (`a`) and wall-clock seconds (`e`). It leads to `/incident?ref=…&v=<version>`.

## Versions

The incident's version is the revision played, shown as its first 8 hex digits. A link's `v` resolves to exactly one published revision of INC-1 (`resolveVersion` in `apps/web/lib/incident.ts`) or to none, which the page says before offering the current incident. `/work/INC-1?revision=` accepts only INC-1's published revisions (others are 404). An attempt stays on the revision its start or replay move named while that revision is published.

The first incident (`sha256:81a951d5…`) was replaced outright by the current one, not kept: its links offer the current incident, and an attempt started on it continues on the current revision. Records made against it keep naming it.

## Attempts and replays

A done incident can be replayed on purpose from `/incident`, after a confirmation that says what a replay is. The replay is a board move from Done to In progress with `trigger: "replay"` and starts a new attempt (`apps/web/lib/attempts.ts`): code restore, teammate feedback, the chat, which pull request may merge, the result's numbers and the report gate all read that attempt's records only. Nothing earlier is deleted; code changed after an earlier merge stays recorded with that attempt. Pull request numbers continue across attempts. The report says "First response" or "Replay n"; analysis tells them apart by the replay moves.
