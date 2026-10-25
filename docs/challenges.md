# Challenges

What a challenge is, how it is checked, and where it is stored. The model is in `packages/content` (types in `model.ts`, validation, revision hashing, rules and publish checks); the seed (`content/seed.ts` and `content/more/`) is built into `content/catalog.json` by `tools/build-content.ts`, and the app reads every page and practice from it.

## Principles

1. **One challenge, immutable revisions.** A challenge has one permanent identity and appears once in lists; nobody sees versions. Changing what is measured makes a new immutable _revision_, identified by its content hash, and only the latest is live. Recorded data names the exact revision someone worked against.
2. **Clear, then hard.** The task says everything required. Difficulty comes from solving the problem, not from decoding the prompt. Realistic framing is welcome only where it helps explain the problem.
3. **Deterministic checks.** Cases and rules decide completion. The same code gets the same verdict for everyone, every time.
4. **AI only offline.** A model may draft challenges; a person reviews everything before it is published. Nothing a model generates reaches someone while they practise, and no player data goes to a model.

## The challenge

Two parts: **live metadata**, editable in place, and the **revision**, immutable.

```ts
interface ChallengeMetadata {
  id: string; // "refund-totals": permanent
  key: string; // "JS-005": the language's code and a number, permanent (see Keys)
  title: string;
  summary: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[]; // lowercase slugs: strings, edge-cases, money, …
  revision: string; // the live revision's id
}

interface Revision {
  challenge: string; // ChallengeMetadata.id
  body: string; // markdown: the task
  workspace: {
    language: string; // the runner follows from it
    files: Record<string, { role: "edit" | "read"; language: string; text: string }>;
    entry: string; // the one editable file, which defines the entry point
    entrypoint: string; // the function the checks call
    parameters?: string[]; // named when each case's input is a list of arguments
    schema?: string; // SQL: CREATE TABLE statements run before each case
    adapter?: string; // C, C++ and Java: JSON arguments to the function's types
  };
  checks: {
    cases: { id: string; name?: string; input: Json; expected: Json; visible: boolean }[];
    rules: { id: string; message: string; when: RuleTrigger }[];
  };
}
```

A revision's id is `sha256:` of its canonical JSON. The catalog (`schemaVersion` `1.0.0`) holds every challenge's metadata and its live revision.

**One file to edit.** Practice shows one editable file, the entry. Other files are `read` source the program loads but the person cannot change; only runners that load several files (`multiFile` in `packages/runner/engines.ts`: JavaScript, TypeScript and Python) accept them. The task states the API of any code the entry relies on.

**Cases.** Without `parameters`, a case's input is the function's only argument; with them, the list of arguments in order. A SQL case's input is rows per table, and its output the rows the last statement returns. A case passes when the returned value equals `expected` as canonical JSON. **Examples** (`visible`) are shown with the task and run by **Run examples**; the rest run only on **Submit**, which reports them by position and failure category (a different value, an error, nothing, a value that can't be compared), never their names, inputs, expected values, output or error text (`apps/web/lib/diagnosis.ts`). The hidden cases travel to the browser with the revision, so this is what the UI shows, not secrecy.

**Rules.** A rule is a check on the code beyond the cases, such as keeping money in whole cents. While it fires, a submission is not complete, and the feedback shows its message. Rules read code as text (`packages/content/rules.ts`), the same in every language:

| Trigger | Fires when |
| --- | --- |
| `{ pattern, present }` | a regular expression is found (`present: true`) or missing (`false`) in the editable file |
| `{ metric, above }` | a size measure is above the bound: `lines` (non-blank lines), `function-lines` (the longest function, by braces, or by indentation in Python and Ruby), `nesting` (the deepest block) |
| `{ all }`, `{ any }`, `{ not }` | combinations |

A trigger may name a `file`; otherwise it reads every editable file. **Complete** means every case passed and no rule fires (`apps/web/lib/submission.ts`). Text rules can be fooled by renaming or formatting; syntax-aware rules can come later without changing their shape.

## Keys

A challenge's key is its language's code and a three-digit number: `PY-003`, `JS-012`, `CPP-001` (`packages/content/keys.ts`). It is written into the seed, checked by the build against the language, and permanent: a published challenge keeps its key, no key ever moves, and a new challenge takes the next free number in its language. Keys appear in URLs (`/challenges/PY-003`), shared links and recorded data (`challengeKey`); the permanent `id` is what observations carry as `challenge`.

## Revisions and live metadata

| Live metadata: edit any time | Revision content: a change makes a new revision |
| --- | --- |
| title, summary, difficulty, tags | the task, workspace files, entry point, cases, rules |

Saving a change to revision content makes a new revision under its own hash; there is no version number to choose. Recorded work names the revision it ran against, so it stays readable after the challenge changes. Retire and replace a challenge, rather than revising it, when the problem itself changes substance.

Before launch, formats and revisions can be reset freely (root `AGENTS.md`): the build keeps only live revisions today.

## The private part

Each seed challenge has a `private` part that is never written to the catalog: the **reference solution**, optional **alternatives** (other correct designs, which must pass) and **wrong solutions** (plausible mistakes, which must fail), and for each rule **examples** that must fire it and must not. The build refuses a challenge whose private part fails the publish checks (`packages/content/publish.ts`):

- the reference changes only editable files and is not the starter;
- every rule has examples both ways, and fires on neither the reference nor any alternative (a rule may not insist on one correct design);
- a JavaScript or Python challenge names at least one alternative and two wrong solutions.

`npm run check:publish` (`tools/browser/content-check.ts`) then runs, in the browser sandbox, the reference (twice, which must agree), the starter (which must fail), the alternatives and the wrong solutions. Run it after changing a challenge's code or cases.

## Adding a challenge

In `content/seed.ts` (or a file in `content/more/`): a clear task, the next free key in its language, difficulty and tags, an entry point and starter, cases with their edge cases (mark the hidden ones), any rules with examples, and the private part. Then `npm run build:content`, and commit `content/catalog.json` with it; `npm run check:content` fails when they disagree. Never edit the catalog by hand.

## Where it will be stored

Today the catalog is a file built from the seed. Later:

| What | Where |
| --- | --- |
| Challenges, revisions, private parts, change log | a database (Cloudflare D1) behind an admin UI and Cloudflare Access |
| Published revisions | R2, one immutable object per revision, cached forever |
| What is live | a small index object: every live challenge's metadata and revision id |
| Derived stats (solve rate, measured difficulty) | the analysis store, recomputed from observations, never written into challenges |

The admin flow: an AI or human draft, a person's edit with a live preview in real practice, the publish checks, approval by someone who did not draft it, then published (live), retired (out of lists, recorded work stays valid) or disabled (now, with a reason).
