# Issue model

What an issue is, how it is managed and where it is stored.

**Built so far:** the model itself. Issue metadata, revisions and the catalog are in `packages/content` (types, validation, revision hashing). The seed (`content/seed.ts`) is built into `content/catalog.json` by `tools/build-content.ts`, and the app reads every page and the IDE from it. Recorded data names the issue and revision. The IDE takes several editable and read-only files, recorded per file (JavaScript and TypeScript run them; other runners still load one source file). **Not built yet:** trigger evaluation (teammate comments other than the opening notes, review comments, hints, the merge gate for blocking threads), the database, R2 and the admin UI. Until then, the seed and its build stand in for authoring.

## Principles

1. **One issue, immutable revisions.** An issue has one permanent identity and appears once in lists; players never see versions. A material edit creates a new immutable *revision*, identified by its content hash, and only the latest is live. Recorded data points at the exact revision a player saw. Metadata that does not change what is measured stays editable (see [Revisions and live metadata](#revisions-and-live-metadata)).
2. **Deterministic at runtime.** CI, teammate comments and hints are fixed content released by rules. The same code and the same behaviour produce the same feedback for everyone, every time.
3. **AI only offline.** A model may draft issues, comments and hints. A person reviews everything before it is published. No model runs while someone plays, and no player data is sent to one.
4. **Measurable.** Every piece of feedback a player gets is recorded with what released it. Everything before the first teammate comment or hint is the unaided measure.

## From simple to real

Each issue has one **format**: what the player hands in. The format decides which checks can apply.

| Format | The player hands in | Checked by | Examples |
|---|---|---|---|
| `code-change` | changes to one or more files | tests, static rules, scaling checks | feature, bug fix, refactor, performance |
| `tests` | test code for given code | mutation testing (planted bugs must fail) | "cover the discount rules" |
| `review` | comments on lines of a given pull request | match against planted issues (line ranges, category) | review a teammate's PR |
| `answer` | an exact value | exact or normalised match | trace output, find the failing input, root cause of an incident |
| `choice` | picks, rankings or placements | the fixed key | architecture and design trade-offs |

Only `code-change` exists today, as a single file. Realism grows along three axes the model must allow from the start:

- **More context:** a small repo of many files, some read-only.
- **Less hand-holding:** a bug report or logs instead of a failing test.
- **Continuity:** an issue that starts from the player's own merged code from an earlier issue in the same project (an *arc*).

## Revisions and live metadata

An issue's fields fall into two groups:

| Live metadata: edit any time | Revision content: a change makes a new revision |
|---|---|
| title, summary, difficulty, estimate, labels, project placement and order, live or retired | ticket body, kind, skills, format, workspace files, checks, teammate comments, triggers, hints, relations |

- **Live metadata** describes the issue on the board. It does not change what a player is measured on, so it changes in place. A change log records every edit with its time, so analysis can still tell what the board showed when.
- **Revision content** is what the player works against. Saving a change makes a new revision: an immutable snapshot whose id is the SHA-256 of its canonical JSON (`sha256:…`). There is no version number to choose or bump.
- **Only the latest published revision is live.** Every recorded observation and pull request names the revision it ran against, so old work stays readable after the issue changes.
- **Done stays done.** A player who finished an earlier revision keeps the issue as Done; the issue page says it was updated since they finished, and they can take it again.
- **Retire and replace** only when the problem itself changes substance, such as a different skill or a different bug. That is a new issue, not a revision.

## The issue

Two parts: **metadata** (live) and **revision content** (immutable). Published revisions are served to the browser as *bundles*. Each issue also has a **private** part that never leaves the database.

```ts
interface IssueMetadata {
  id: string;                 // "refund-totals": permanent
  number: number;             // SHOP-7: project key + number, permanent
  project: string;            // the project that lists it
  title: string;
  summary: string;
  difficulty: "warm-up" | "easy" | "medium" | "hard";
  estimate: number;           // points
  labels: string[];
  state: "draft" | "live" | "retired" | "disabled";
  live?: string;              // revision id of the live revision
}

interface Revision {
  id: string;                 // "sha256:…" of this object's canonical JSON, minus this field
  issue: string;              // IssueMetadata.id
  body: string;               // markdown: the ticket
  kind: "feature" | "bug" | "performance" | "refactor" | "review" | "design";
  skills: string[];
  format: "code-change" | "tests" | "review" | "answer" | "choice";
  workspace: Workspace;       // the repo the IDE opens
  checks: Checks;             // CI: deterministic, decides merging
  team: TeamComment[];        // prewritten teammate comments with triggers
  hints: Hint[];              // prewritten, ordered, released on behaviour

  relations?: {
    requires?: string[];      // issue ids to play first
    arc?: { id: string; position: number; startsFrom?: string }; // builds on your own merged code
    equivalent?: string;      // parallel-form group: same skill and difficulty, different surface
    replaces?: string;        // the retired issue this one replaces
  };
  authored: { by: "human" | "ai-drafted" | "ai-drafted-human-reviewed"; reviewers: string[] };
}

interface Workspace {
  language: string;           // runtime engine follows from it
  base?: string;              // a project base repo bundle to start from; files below add or override
  files: Record<string, { role: "edit" | "read" | "tests" | "docs"; language: string; text?: string; blob?: string }>;
  entrypoint?: string;        // and parameters / adapter / schema, as today
}

interface Checks {
  cases: { id: string; input: unknown; expected: unknown; visible: boolean }[];
  rules?: StaticRule[];       // e.g. "no function longer than 40 lines" for a refactor
  scaling?: { case: string; factor: number; limitMs: number }[]; // performance issues
}
```

The **private** part holds what a player must never receive: the **reference solution**, **trigger examples** (code that must and must not fire each comment), and **author notes**. It lives in the database next to each revision. Publication checks use it; it is never written to a bundle.

### Bundles: a whole mini repo in one object

A published revision is served as one JSON document: the metadata needed to show it, plus everything in the revision (ticket, every workspace file's text, checks, comments, hints). These repos are a few text files, a few kilobytes, so JSON is the simplest format: the browser loads it directly, the admin UI can diff it, and it hashes cleanly.

- The bundle's id is its content hash, so it can never change without becoming another revision.
- Binary assets, such as a screenshot in a bug report, are stored once each under their own hash (`blobs/<sha256>`) and referenced with `blob`, the way git stores objects.
- When a project's codebase grows, its shared files can be a **base bundle**; issues reference it with `base` and add or override only their own files, instead of copying 30 files into every issue.

### Teammate comments

```ts
interface TeamComment {
  id: string;                         // "ada-intl-format"
  author: string;                     // a project persona: "Ada N"
  where: "issue" | "review";          // the ticket's thread, or a review on the pull request
  severity: "blocking" | "nit" | "info";
  text: string[];                     // a few wordings; picked by player and comment, so stable per person
  when: Trigger;
  repeat?: "once" | "while-true";     // review comments re-check on every push
}
```

A **blocking** comment must be resolved before merging: either the next push no longer triggers it, or the player replies. A reply needs no approval; the reply text is recorded. A **nit** is shown but never blocks. Merge needs green CI *and* every blocking thread resolved.

### Hints

```ts
interface Hint {
  id: string;
  level: number;              // released strictly in order
  author: string;
  text: string;               // an idea about the approach, never solution code
  when: Trigger;              // behaviour only
}
```

There is no "ask for a hint" button. Hints arrive the way a colleague notices someone is stuck, one level at a time, never two at once.

### Triggers

Every trigger is a pure function of recorded facts, so it can be re-evaluated later and gives the same answer.

| Kind | Fires when | Example |
|---|---|---|
| `event` | issue opened, first run, pull request opened, pushed, merged | welcome note on opening |
| `metric` | a size measure of the code crosses a bound: lines, function lines, nesting depth | `{ metric: "function-lines", above: 30 }` |
| `pattern` | text is present or absent in a file (regular expression) | uses `toFixed` and no `Intl.NumberFormat` |
| `check` | a named case fails or passes on a push | refund case fails: "refunds broke again" |
| `behaviour` | active minutes without progress, failing pushes, runs without progress | `{ failingPushes: 3 }` |

Triggers combine with `all`, `any` and `not`. **Active minutes** count minutes with an edit or a run, ignoring gaps over five minutes, so a lunch break never releases a hint. **Progress** means the number of passing cases went up.

Pattern rules are text-based for now, so they work the same in all twelve languages. Syntax-aware rules can come later per language without changing the manifest shape.

## What gets recorded

New workspace observations, under a capture version bump when built:

- `comment` — a teammate comment fired: comment id, revision, the push (if any) and which trigger part matched.
- `thread-resolved` — a blocking comment resolved: by `code` (with the push) or by `reply` (with the text).
- `hint` — a hint released: hint id, level, revision and the trigger.

From these, every attempt can say when it stopped being unaided, which feedback it got and how it responded.

## A worked example

**SHOP-7 · Refund totals double-count discounts** (bug, medium, JavaScript)

- **Ticket:** Support says a refunded order with a promo code shows a negative total. A screenshot of the receipt is in the body; no failing test is given.
- **Workspace:**
  - `src/cart/totals.js` (edit);
  - `src/cart/discounts.js` (read);
  - `src/cart/totals.test.js` (tests, visible cases only);
  - `README.md`.
- **Checks:** eight cases, three of them hidden, covering a refund with a discount, a full refund and a zero-value order.
- **Team:**
  - *Jo T (Support), issue, info, on opened:* "40 tickets about this since Monday. It's only orders with a code."
  - *Ada N (Frontend), review, blocking, pattern* `Math.abs\(` *in* `totals.js`: "Taking the absolute value hides the sign we need for refunds. Can we keep refunds negative all the way through?"
  - *Ada N, review, nit, metric* `function-lines > 30`: "`cartTotal` is getting long; would a helper for the discount step read better?"
  - *Sam R (SRE), review, info, check `refund-with-code` passes:* "Nice, that's the one from the incident."
- **Hints:**
  - level 1, after 12 active minutes without progress: "Where is the discount applied: before or after the refund sign?"
  - level 2, after 3 failing pushes: "Try the refund case on paper: the discount ends up subtracted twice."
- **Private:**
  - the reference fix;
  - for the `Math.abs` comment, one example that must fire it and one that must not.

## Managing issues

Issues live in a database behind an admin UI. A revision moves through review before it can go live; the issue itself is draft, live, retired or disabled.

```text
AI draft ─▶ human edit ─▶ checks ─▶ approved ─▶ published (live) ─▶ retired
                                                        └────────▶ disabled (now, with a reason)
```

- **Draft.** A model may produce the first revision (ticket, workspace, cases, comments, hints) and its private part. A person edits it in the admin UI with a live preview in the real IDE.
- **Checks** run in a sandboxed worker against the exact revision:
  - the **reference solution** passes every case;
  - the **starter** fails at least one case;
  - running twice gives the same result (no flaky checks);
  - every **trigger example** fires or stays quiet as declared;
  - the **reference solution** triggers no blocking comment;
  - **comments and hints** contain no long passage of the reference solution.
- **Approved** by a person who did not draft it.
- **Published.** The revision is frozen, written as a bundle, and becomes the issue's live revision. Players starting the issue get this revision; work in progress on an older one keeps its own.
- **Retired.** Out of lists and no new starts; recorded work stays valid. This is how issues rotate to keep the board fresh.
- **Disabled.** For problems that must stop now (a leaked answer, a broken check), with a reason.

Live metadata (difficulty, labels, title, placement, state) changes directly in the admin UI and goes to the change log.

**The admin UI's** main screens:

- **queue:** revisions waiting for review;
- **editor:** the revision with a live preview in the real IDE;
- **check report:** each check above, passed or failed;
- **publish, retire and disable controls;**
- **catalog:** every issue with its state, revisions, change log and live numbers (players, solve rate, median active time).

Those live numbers are **derived** from player data and stored separately; they never write into an issue.

## Where it is stored

| What | Where |
|---|---|
| Issues, revisions, private parts, change log | a database (Cloudflare D1), the source of truth, behind the admin UI and Cloudflare Access |
| Published bundles | R2, one immutable object per revision: `bundles/<revision id>.json`, plus `blobs/<sha256>` for binary assets |
| What is live | a small index object in R2 (`index.json`): every live issue's metadata and live revision id. Publishing, retiring and metadata edits rewrite it |
| Derived stats (solve rate, measured difficulty) | the analysis store, recomputed from observations, never written into issues |
| Player work and observations | the player's browser today; a server store once accounts and research collection exist, naming revisions by id |

The app reads the index for lists and fetches a bundle when an issue opens. Bundles never change, so they cache forever; only the index is short-lived. Adding, changing or retiring an issue needs no deploy.

The content in the repo today (`content/` and the generated demo catalog) becomes seed data for the database. Its semver versions and older-version pages go away; nothing is released, so there is nothing to stay compatible with.

## Known limits

- Checks run in the player's browser, so hidden cases, comment text and hint text are present in the bundle and readable by anyone who looks. That is acceptable while cheating only costs the cheater; a server-side runner would close it.
- Text pattern rules can be fooled by renaming or formatting. Blocking comments therefore always accept a reply.
- AI-drafted issues may resemble problems models have seen. `authored.by` lets comparisons with models control for that.
