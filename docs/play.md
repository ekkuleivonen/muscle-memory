# The five-minute test and sharing

How people arrive from a shared link, and how a result gets shared. The goal is the shortest path from a post to code in an editor, with every attempt still recorded under accepted Terms.

## The test (`/play`)

- One small bug, the same in eight languages: the quick fixes project (`PY-001` to `PHP-001`, "The composer says 1 word when the post is empty"), in Python, JavaScript, TypeScript, Go, Java, C#, Ruby and PHP. The project is **unlisted** (`listed: false` on the project, live metadata): it stays out of the platform's issue lists, suggestions and project index, and its issues open by key. Personal board, progress and pull-request metadata use the full catalog, so QUICK practice still counts.
- `/play` is public. It shows the ticket and a language picker; the language a shared link names (`?lang=go`) comes first.
- **No setup questions.** Picking a language accepts the current Terms (the line above the buttons says so, including that every keystroke is recorded) and opens `/work/QUICK-n`, recording the same start-work board move as the standard entry.
- **The language picked is a first guess at the languages answer.** It is saved into the profile when the profile has none, so every IDE session's profile snapshot carries it, and recorded as a `profile` event with `from: "play"`. The languages question stays open until the person answers it ([profile](profile.md)).

## Getting in, everywhere

Accepting the current Terms is the only thing any page requires (`requireConsent`):

- Someone who has not (a deep link, or the Terms changed since) is sent to `/consent`: the Terms in four points, one button, then on to the page they were heading for. `/play` does the same inline.
- The landing page leads to the five-minute test, or to `/challenges` once the Terms are accepted. There is no onboarding: the profile questions are in settings, and nothing insists on them ([profile](profile.md)).

## The outcome

A merged pull request shows its **Outcome** at the top of its page, with no extra step: first a brief (`apps/web/lib/brief.ts`), the latest CI result with the first submission's when they differ and at most three lines taken from the full evidence (whether the code pushed last was tested first, CI-only checks, missing evidence), then **All evidence** folded. An open pull request has no outcome: its merge box says what is left. The full evidence is read from the same records as the pull request (`apps/web/lib/evidence.ts`, rendered by `pull-outcome.tsx`), never written back and never a score, rank or badge. In order: what changed (files and lines against the starter code, pushes), correctness (CI on the first submitted push and, separately, on the latest one, with what came back in between by recorded push order: failing CI on earlier pushes and review comments on them; the repo's own tests), what CI checked beyond the visible tests, verification (local runs, and whether the code pushed last was tested first: only a local run that finished before that push started, on the same code (the same artifact, or identical complete files) and the same version of the ticket, counts; when no earlier run can be matched it is not known, never assumed), recovery (failed or errored runs before the first green one, failing pushes, earlier pull requests closed, review findings and how each was resolved), help (hints, teammate comments, the editor features on, pastes) and, last, time.

The outcome is read up to the merge (or now, while open): anything recorded on the issue afterwards, such as a later session, never changes it. Each line is marked **observed** (a fact in the records), **not known** (the code wasn't kept, a capture gap, a check that never reached the tests, an older record without the breakdown) or a limited **reading** of observed facts. Production is always "not known": the checks ran in the test runner and nothing was deployed. Time is reported with the caveat that it includes reading and waiting on the runner; pastes, page switches and time say what happened, not how good anyone is, and nothing infers anything about AI use.

While a pull request is open, the same evidence lists what to do **before merging**, taken from the one merge gate's verdict (`mergeEligibility` in `lib/merge.ts`, passed in as `blocker`): checks failing, still running, run against a different version of the ticket, or on code that has changed since (or can't be matched to) the latest push. Findings still to resolve are listed alongside. The latest result is the highest push number, as the gate reads it. Without the gate's verdict nothing is called stale; only failing checks and open findings are listed.

`publicEvidence` is the outcome as it may leave the browser, for sharing: counts and statuses only, the first submission's checks next to the latest's (no code, file paths, comment text, timing or assistance beyond the hint count), and `parsePublicEvidence` reads one back from untrusted input.

## The result

A merged pull request's Details list what happened, next to the facts already there, computed in the browser from the person's own records (`metricsOf` in `apps/web/lib/result.ts`, metrics version 2):

- **active time**: gaps between activity (keys, edits, cursor, scrolling, runs, navigation), each counted up to a minute;
- **opened to first edit**: from first opening the issue to the first edit;
- **keystrokes**: keys pressed in the editors, modifier keys alone not counted;
- **typos fixed**, an estimate: runs of Backspace or Delete starting within two seconds of typing a character;
- **peak speed**: the most characters typed in any ten seconds, as words (5 characters) per minute, once at least 15 were typed;
- **test runs**, and which one first passed every case ("green first try");
- **hints**, **pastes** and **left the tab** (times the page was hidden).

The fix itself is never shown, so a friend still gets a fair go. The same numbers are recorded at the merge as a `result` event, so aggregates use exactly the definitions people see. After the outcome, at the foot of the page, the experience and AI-use questions are asked while open, one tap each and skippable with Not now, recorded as `profile` with `from: "result"`.

**Share result** in the merge box opens a preview of exactly what a post or chat will show (the shared link's image and text), then copy link, X, LinkedIn or the system share sheet. The link is `/r/<card>`: the numbers, base64url-encoded in the path, plus this device's **referral code**, a random code separate from the participant ID. Only allowlisted fields are ever encoded (`publicResult` in `apps/web/lib/result.ts`): a field added to the metrics stays out of links until it is listed there. The link is a brag, not a record: anyone could edit it, so nothing trusts it.

**Code is left out unless the person ticks "Include my code"**, which starts unticked every time the dialog opens, names the file and says who can read it. Ticked, their solution goes into the link itself: a challenge has one file to edit, so normally that one file (for a challenge that still had several, every changed file), deflated in its fragment (`/r/<card>#code=…`, `apps/web/lib/share.ts`): browsers never send a fragment to the server, so nothing stores the code, and copying a link without the box ticked never includes it. It is all the changed files or none: more than eight files, a name that can't go in a link, a file kept only in part, or code over the size limits (inflated UTF-8 JSON bytes, `MAX_JSON_BYTES`, the same budget the reader enforces, and `MAX_CODE_FRAGMENT` characters of link) is refused with a message saying why, never cut or partly shared. A link is only offered once it has been read back as exactly those files. The `shared` event records the card only, not whether code was included.

## Comparing with everyone else

A player against anonymous aggregates, never a list of people. `tools/aggregates/aggregate.py` runs daily after the erasure job (`.github/workflows/erasure.yml`): it reads every `result` event, keeps each participant's first finish of each issue, leaves out stealth players and anyone who asked for deletion, and writes the 0th–100th percentiles of active time (and peak speed) per issue to `aggregates/v1.json` in the control bucket. The ingest Worker serves it at `GET /ingest/v1/aggregates`, cached for an hour.

The card compares in the browser: "Faster than 72% of people who fixed it in Python", once at least 50 people have finished that issue (`COMPARE_FROM`); before that, "One of the first 50 people to fix it in Python". Older shared links may carry the comparison; they still decode, but the shared page and preview no longer show it (future comparisons belong to the profile, as separate validated work). Stealth players see no comparison, as the Privacy Notice says. "People who fixed it", not "developers": the players chose to be here.

## Sharing a challenge (`/try/<KEY>`)

Every challenge has a public page at `/try/<KEY>` (the permanent key; a lowercase key or the challenge's id redirect to it): its goal and requirements, its published examples (labelled Input and Expected output; the checks beyond them stay hidden, as in practice) and **Start <KEY> yourself**, with the same Terms line as `/play` for someone new. Starting opens the visitor's own attempt: from the starting code, or where they left it if they had started it in that browser. The link names only the challenge, so it never carries anyone's code, attempt, board or records. Its preview image (`try/[key]/opengraph-image.tsx`) names the challenge, its language and its one-line goal. **Copy challenge link** copies it. A key that is not in the catalog gets a page saying so.

The result link is how a finished attempt is shared.

## The shared page (`/r/<card>`)

Public. A link made from practice is a **version 3** card (`lib/outcome.ts`): built only from a recorded `checks-passed` completion, it carries the challenge, language, checked revision, the final full check, and optionally the first full check and the number of full checks, plus the referral code; never timing, speed, example runs, ranks or comparisons. It reads "Completed “<title>” (<KEY>) in <language>. All <n> checks passed.", says when it was completed on an earlier revision than the live one, and never says "without AI" as a fact: the editor's lack of AI features is described as a practice condition. Older version 2 cards still open. It shows the receipt, headed by one sentence naming the challenge by title (`sentence` in `lib/result.ts`), a preview image with the same sentence and the checks for posts and chats (`opengraph-image.tsx`, 1200×630), and "Your turn", which leads to `/try/<KEY>` for the same challenge. A version 2 card was made when a pull request was merged, the completion of the time, so it reads as **completed**, with the checks it carries, never "without AI" as a fact (the editor's no-AI setting is described as a condition); its PR-era numbers are shown in challenge terms (a push ran the full checks, so pushes read as "full checks run"; local runs as "example runs"), and hints or open findings only when the card has some. Code included by choice is read from the fragment in the page, shown collapsed below as plain text: one file as "their solution", and a link with several files (made when a challenge had several) shows every one, in full. A fragment that does not decode says so and shows nothing. A link that cannot be shown gets a page that says why and invents nothing: **incomplete** (does not decode to a card we would have made), **older version** (an earlier card version, or one from the retired incident; offers the issue it named if it still exists), or **issue retired**.

## Measuring the loop

Nothing is recorded before the Terms are accepted, so visits that never start are not counted (a declared gap). Afterwards:

- `arrived` (once per browser): the first landing page, when, and the referral code that brought the person, if any. It is remembered in the browser from the moment of landing and recorded when the Terms are accepted.
- `shared`: which card, through which channel, with the sharer's referral code.

Joining `shared.ref` to `arrived.ref` gives shares, the arrivals each brought, and from those people's own records whether they started, finished and shared in turn.

## Returning to practice

Entry pages explain browser-local identity and saved work: uploads do not provide recovery or device sync. Five minutes is a guide, not a timer. A merged result leads to a deterministic unstarted issue (runnable, preferred language, then easier difficulty) and back to the desk, before optional sharing and questions. The dashboard prioritises unfinished work, then a quick start; optional language preferences sit beside suggestions.

## Entry points and legacy links

Every way in leads to the same loop: challenge, code, feedback, next challenge. There is no incident wrapper, team chat or completion ceremony around it.

- `/` says what the practice is and offers the five-minute test (or `/challenges`, once the Terms are accepted).
- `/challenges` lists every listed challenge; Enter (or **start practice** in the preview) opens `/work/<KEY>` on its live revision. `/work/<KEY>?revision=sha256:…` opens one of that issue's published revisions exactly; a revision that is not published opens the live one at the plain URL.

The incident (JS-001, "Production is down. AI is down.") was retired as a wrapper, and its `/incident` links are gone. JS-001 stays an ordinary issue under the same key and id, so attempts already made keep their pull requests, findings and records. Revisions that carry the retired chat lines are still in the catalog; nothing shows them.

The integrated ordinary PR outcome and public result use the same factual evidence projection: first submission and latest checks, CI-only checks, runs, pushes, findings and hints, with missing evidence labelled. Public cards omit code unless explicitly selected, retain no demographic/private fields, and make no typing-speed ranking or production-success claim.
