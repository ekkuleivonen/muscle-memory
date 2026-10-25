# Challenges

What a challenge is, how it is written and checked, and where it is stored. The model is in `packages/content` (types in `model.ts`, the folder reader in `source.ts`, validation, revision hashing, rules and publish checks). Challenges live in `content/challenges/<KEY>/`; `tools/build-content.ts` builds them into `content/catalog.json`, which the app reads. The catalog is a build output: it is made before dev, builds and tests, and never committed.

## Principles

1. **One challenge, immutable revisions.** A challenge has one permanent identity and appears once in lists; nobody sees versions. Changing what is measured makes a new immutable _revision_, identified by its content hash, and only the latest is live. Recorded data names the exact revision someone worked against.
2. **Clear, then hard.** The task says everything required. Difficulty comes from solving the problem, not from decoding the prompt. Realistic framing is welcome only where it helps explain the problem.
3. **Deterministic checks.** Cases and rules decide completion. The same code gets the same verdict for everyone, every time.
4. **AI only offline.** A model may draft challenges; a person reviews everything before it is published. Nothing a model generates reaches someone while they practise, and no player data goes to a model.

## The challenge

Two parts: **live metadata**, editable in place, and the **revision**, immutable.

```ts
interface ChallengeMetadata {
  key: string; // "JS-005": the language's code and a number, permanent (see Keys)
  title: string;
  summary: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[]; // lowercase slugs: strings, edge-cases, money, …
  revision: string; // the live revision's id
}

interface Revision {
  challenge: string; // the key
  task: string; // markdown: what to do
  language: string; // the runner follows from it
  file: string; // the file's name: count_words.py
  starter: string; // the file as practice opens it
  entrypoint: string; // the function the checks call
  parameters?: string[]; // named when each case's input is a list of arguments
  schema?: string; // SQL: CREATE TABLE statements run before each case
  adapter?: string; // C, C++ and Java: JSON arguments to the function's types
  cases: { id: string; name?: string; input: Json; expected: Json; hidden: boolean }[];
  rules: { id: string; message: string; when: RuleTrigger }[];
}
```

A revision's id is `sha256:` of its canonical JSON. The catalog (`schemaVersion` `1.0.0`) holds every challenge's metadata and its live revision.

**One file.** Everything the player writes and reads is the one file. Code the function relies on (a parser, money helpers, constants) sits in the same file, below the function, under a comment saying it shouldn't need changing; the player can read it, and a rule can insist it is used. The task states the goal and the rules, not an API.

**Cases.** Without `parameters`, a case's input is the function's only argument; with them, the list of arguments in order. A SQL case's input is rows per table, and its output the rows the last statement returns. A case passes when the returned value equals `expected` as canonical JSON. **Examples** (cases that aren't `hidden`) are shown with the task and run by **Run examples**; hidden cases run only on **Submit**, which reports them by position and failure category (a different value, an error, nothing, a value that can't be compared), never their names, inputs, expected values, output or error text (`apps/web/lib/diagnosis.ts`). The hidden cases travel to the browser with the revision, so this is what the UI shows, not secrecy.

**Rules.** A rule is a check on the code beyond the cases, such as keeping money in whole cents. While it fires, a submission is not complete, and the feedback shows its message. Rules read the file as text (`packages/content/rules.ts`), the same in every language:

| Trigger | Fires when |
| --- | --- |
| `{ pattern, present }` | a regular expression (multiline) is found (`present: true`) or missing (`false`) in the file |
| `{ metric, above }` | a size measure is above the bound: `lines` (non-blank lines), `function-lines` (the longest function, by braces, or by indentation in Python and Ruby), `nesting` (the deepest block) |
| `{ all }`, `{ any }`, `{ not }` | combinations |

Helpers in the file count too: a rule that a helper must be used looks for a call, not the name alone (`^(?!\s*def ).*\bcanonical_name\(`). **Complete** means every case passed and no rule fires (`apps/web/lib/submission.ts`). Text rules can be fooled by renaming or formatting; syntax-aware rules can come later without changing their shape.

## The folder

```text
content/challenges/PY-003/
  challenge.json   { title, summary, difficulty, tags, file, entrypoint, parameters? }
  task.md          what to do
  tally.py         the starter, under the file's own name
  cases.json       [{ name?, input, expected, hidden? }]
  rules.json       optional: [{ id, message, when }]
  schema.sql       SQL only
  adapter.<ext>    C, C++ and Java only
  private/
    solution.py
    alternative-1.py, …     other correct designs
    wrong-1.py, …           plausible mistakes, each with a comment saying what is wrong
    rules/<rule-id>/fires-1.py, quiet-1.py, …
```

The language comes from the key's code (`PY` is Python). Every code file is a whole file, so it opens with highlighting in any editor and runs as it is.

## Keys

A challenge's key is its language's code and a three-digit number: `PY-003`, `JS-012`, `CPP-001` (`packages/content/keys.ts`). It names the challenge's folder and is its only identifier: permanent, never moved or reused, and a new challenge takes the next free number in its language. Keys appear in URLs (`/challenges/PY-003`), shared links, progress and recorded data (every observation about a challenge carries it as `challenge`).

## Revisions and live metadata

| Live metadata: edit any time | Revision content: a change makes a new revision |
| --- | --- |
| title, summary, difficulty, tags | the task, the file and its starter, entry point, cases, rules |

Saving a change to revision content makes a new revision under its own hash; there is no version number to choose. Recorded work names the revision it ran against, so it stays readable after the challenge changes. Retire and replace a challenge, rather than revising it, when the problem itself changes substance.

**The archive.** The build also writes every revision it makes to `content/revisions/<hex>.json`, once, and those files are committed (CI fails when one is missing). The catalog holds only live revisions; the archive holds every revision ever published, so recorded data that names an older hash can still be read against exactly what was practised. An archived file is never rewritten.

## The private part

`private/` is never written to the catalog: a **solution**, optional **alternatives** (other correct designs, which must pass) and **wrong solutions** (plausible mistakes, which must fail), and for each rule **examples** that must fire it and must not. The build refuses a challenge whose private part fails the publish checks (`packages/content/publish.ts`):

- the solution is not the starter;
- every rule has examples both ways, and fires on neither the solution nor any alternative (a rule may not insist on one correct design);
- a JavaScript or Python challenge names at least one alternative and two wrong solutions.

`npm run check:publish` (`tools/browser/content-check.ts`) then runs, in the browser sandbox, the solution (twice, which must agree), the starter (which must fail), the alternatives and the wrong solutions. Run it after changing a challenge's code or cases.

## Adding a challenge

Make `content/challenges/<KEY>/` with the next free key in its language: a clear task, difficulty and tags, the file's name and entry point, a starter, cases with their edge cases (mark the hidden ones), any rules with examples, and `private/`. `npm run build:content` checks it (`--dry-run` checks without writing), and `npm run check:publish` runs it.

## Where it will be stored

Today the catalog is a file built from the folders. Later:

| What | Where |
| --- | --- |
| Challenges, revisions, private parts, change log | a database (Cloudflare D1) behind an admin UI and Cloudflare Access |
| Published revisions | `content/revisions/` today; R2, one immutable object per revision, later |
| What is live | a small index object: every live challenge's metadata and revision id |
| Derived stats (solve rate, measured difficulty) | the analysis store, recomputed from observations, never written into challenges |

The admin flow: an AI or human draft, a person's edit with a live preview in real practice, the publish checks, approval by someone who did not draft it, then published (live), retired (out of lists, recorded work stays valid) or disabled (now, with a reason).
