# Challenges

What a challenge is, how it is written and checked, and where it is stored. The model is in `packages/content` (types in `model.ts`, the managed-copy reader in `source.ts`, validation, revision hashing, rules and publish checks). Challenges live in managed D1/private R2. `npm run catalog:pull` exports an authorized gitignored copy; `tools/build-content.ts` verifies it and emits the public `content/catalog.json` before development, builds and tests. Missing or invalid copies fail closed. See [private catalog development](private-catalog.md).

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
  hook?: string; // optional one-line pitch for link previews, instead of the summary
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

Authoring sources contain metadata, the task and starter, cases, optional rules/schema/adapter and private QA (reference, alternatives, wrong implementations and rule examples). They are edited through the authenticated admin and stored as immutable private objects. Local tooling uses the same sources from `.local/catalog-copy.json`; it does not read the retained public descriptions in `content/challenges/`.

## Keys

A challenge's key is its language's code and a three-digit number: `PY-003`, `JS-012`, `CPP-001` (`packages/content/keys.ts`). It is the challenge's only identifier: permanent, never moved or reused, and a new challenge takes the next free number in its language. Keys appear in URLs (`/challenges/PY-003`), shared links, progress and recorded data (every observation about a challenge carries it as `challenge`).

## Revisions and live metadata

| Live metadata: edit any time | Revision content: a change makes a new revision |
| --- | --- |
| title, summary, difficulty, tags | the task, the file and its starter, entry point, cases, rules |

Saving a change to revision content makes a new revision under its own hash; there is no version number to choose. Recorded work names the revision it ran against, so it stays readable after the challenge changes. Retire and replace a challenge, rather than revising it, when the problem itself changes substance.

**The archive.** Every published revision remains registered in D1 and immutable private R2 storage, including archived challenges. The managed local copy includes all registered revisions and verifies their content hashes. The build does not create or commit `content/revisions/` files.

## The private part

Private QA is never written to the public catalog: a **solution**, optional **alternatives** (other correct designs, which must pass) and **wrong solutions** (plausible mistakes, which must fail), and for each rule **examples** that must fire it and must not. The build refuses a challenge whose private part fails the publish checks (`packages/content/publish.ts`):

- the solution is not the starter;
- every rule has examples both ways, and fires on neither the solution nor any alternative (a rule may not insist on one correct design);
- every challenge names at least one alternative and two wrong solutions.

`npm run check:publish` (`tools/browser/content-check.ts`) then runs, in the browser sandbox, the solution (twice, which must agree), the starter (which must fail), the alternatives and the wrong solutions. Run it after changing a challenge's code or cases; `npm run check:publish -- PY-003 GO-005` checks only those challenges.

## Adding a challenge

Use the authenticated admin with the next free permanent key: clear task, difficulty/tags, one editable file, starter, cases, optional rules and private QA. Validate in the operator browser and publish explicitly. For local runtime QA, refresh the managed copy, then run `npm run build:content` and `npm run check:publish`. See [admin management](admin-challenge-management.md).

## Where it will be stored

## Storage

Managed D1 stores lifecycle and immutable version registration; private R2 stores authoring sources, published snapshots and the live index. Derived analytics are separate and do not alter challenge content. This change removes private challenge files from the current Git tree, not Git history, prior clones or search caches. Browser-served cases remain inspectable because the sandbox needs them to run.
