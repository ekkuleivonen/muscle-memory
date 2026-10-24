# The five-minute test and sharing

How people arrive from a shared link, and how a result gets shared. The goal is the shortest path from a post to code in an editor, with every attempt still recorded under accepted Terms.

## The test (`/play`)

- One small bug, the same in eight languages: the quick fixes project (`QUICK-1` to `QUICK-8`, "The composer says 1 word when the post is empty"), in Python, JavaScript, TypeScript, Go, Java, C#, Ruby and PHP. The project is **unlisted** (`listed: false` on the project, live metadata): it stays out of the platform's issue lists, suggestions and project index, and its issues open by key. Personal board, progress and pull-request metadata use the full catalog, so QUICK practice still counts.
- `/play` is public. It shows the ticket and a language picker; the language a shared link names (`?lang=go`) comes first.
- **No setup questions.** Picking a language accepts the current Terms (the line above the buttons says so, including that every keystroke is recorded) and opens `/work/QUICK-n`, recording the same start-work board move as the standard entry.
- **The language picked is a first guess at the languages answer.** It is saved into the profile when the profile has none, so every IDE session's profile snapshot carries it, and recorded as a `profile` event with `from: "play"`. The languages question stays open until the person answers it ([profile](profile.md)).

## Getting in, everywhere

Accepting the current Terms is the only thing any page requires (`requireConsent`):

- Someone who has not (a deep link, or the Terms changed since) is sent to `/consent`: the Terms in four points, one button, then on to the page they were heading for. `/play` does the same inline.
- "Start your first day" on the landing page goes to the dashboard (through `/consent`). There is no onboarding: the profile questions are asked in place, one at a time, and can always wait ([profile](profile.md)).

## The result

A merged pull request's Details list what happened, next to the facts already there, computed in the browser from the person's own records (`metricsOf` in `apps/web/lib/result.ts`, metrics version 2):

- **active time**: gaps between activity (keys, edits, cursor, scrolling, runs, navigation), each counted up to a minute;
- **read before typing**: from first opening the issue to the first edit;
- **keystrokes**: keys pressed in the editors, modifier keys alone not counted;
- **typos fixed**, an estimate: runs of Backspace or Delete starting within two seconds of typing a character;
- **peak speed**: the most characters typed in any ten seconds, as words (5 characters) per minute, once at least 15 were typed;
- **test runs**, and which one first passed every case ("green first try");
- **hints**, **pastes** and **left the tab** (times the page was hidden).

The fix itself is never shown, so a friend still gets a fair go. The same numbers are recorded at the merge as a `result` event, so aggregates use exactly the definitions people see. Under the merge, the experience and AI-use questions are asked while open, one tap each, recorded as `profile` with `from: "result"`.

**Share result** in the merge box opens a preview of exactly what a post or chat will show (the shared link's image and text), then copy link, X, LinkedIn or the system share sheet. The link is `/r/<card>`: the numbers, base64url-encoded in the path, plus this device's **referral code**, a random code separate from the participant ID. The link is a brag, not a record: anyone could edit it, so nothing trusts it.

## Comparing with everyone else

A player against anonymous aggregates, never a list of people. `tools/aggregates/aggregate.py` runs daily after the erasure job (`.github/workflows/erasure.yml`): it reads every `result` event, keeps each participant's first finish of each issue, leaves out stealth players and anyone who asked for deletion, and writes the 0th–100th percentiles of active time (and peak speed) per issue to `aggregates/v1.json` in the control bucket. The ingest Worker serves it at `GET /ingest/v1/aggregates`, cached for an hour.

The card compares in the browser: "Faster than 72% of people who fixed it in Python", once at least 50 people have finished that issue (`COMPARE_FROM`); before that, "One of the first 50 people to fix it in Python". The shared link carries the comparison, so the shared page and preview show it. Stealth players see no comparison, as the Privacy Notice says. "People who fixed it", not "developers": the players chose to be here.

## The shared page (`/r/<card>`)

Public. It shows the receipt, a preview image (the headline sentence and keystrokes, typos, speed and pastes) for posts and chats (`opengraph-image.tsx`, 1200×630), and "Your turn", which leads to `/play?ref=<code>&lang=<language>`. A link that does not decode to a card we would have made goes to `/play`.

## Measuring the loop

Nothing is recorded before the Terms are accepted, so visits that never start are not counted (a declared gap). Afterwards:

- `arrived` (once per browser): the first landing page, when, and the referral code that brought the person, if any. It is remembered in the browser from the moment of landing and recorded when the Terms are accepted.
- `shared`: which card, through which channel, with the sharer's referral code.

Joining `shared.ref` to `arrived.ref` gives shares, the arrivals each brought, and from those people's own records whether they started, finished and shared in turn.

## Returning to practice

Entry pages explain browser-local identity and saved work: uploads do not provide recovery or device sync. Five minutes is a guide, not a timer. A merged result leads to a deterministic unstarted issue (runnable, preferred language, then easier difficulty) and back to the desk, before optional sharing and questions. The dashboard prioritises unfinished work, then a quick start; optional language preferences sit beside suggestions.
