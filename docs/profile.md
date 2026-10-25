# The profile and its questions

There is no onboarding. Accepting the current Terms is the only thing any page needs (one click at `/consent`, or picking a language on `/play`); after that, the questions wait in settings and nothing insists on them.

## The questions

The questions live in `apps/web/lib/questions.ts` (experience, how often you code with AI, languages, goal, editor keys). Each place that asks shows the first of its questions still open, with a line on why it matters there:

| Where | Asks | `from` |
| --- | --- | --- |
| Settings (`/settings/profile`, or one question at `/settings/profile/<question>`) | all of them, to answer or change | `settings` |
| The five-minute test, picking a language | languages, as a first guess | `play` |

The pages that used to ask in place (a pull request's outcome, the dashboard, a challenge's page) are gone, and with them the `ask.tsx` prompt; their `from` values stay valid in recorded data.

A question is **open** while it has no answer and is not put off (`isOpen` in `apps/web/lib/profile.ts`). "Not now" puts it off on this device for three days (`SNOOZE_MS`), everywhere, and then it may come back; the place that asked stays quiet for the rest of that visit, so declining never brings on another question. Answering moves on to the next open one. The languages question stays open until the person answers it: the five-minute test's language seeds the answer as a guess (`from: "play"`) but does not close it.

Adding a question: add it to `QUESTIONS` and to `Profile`; the settings form shows it. Asking it anywhere else needs a new `from` in `PROFILE_SOURCES`, `packages/domain/board.ts`, and a capture version bump.

## What is recorded

Every answer records `observation.board.profile` ([board activity](board-activity.md)) with the place that asked and the whole profile as saved: every answer, which ones the person gave themselves (`answered`), and stealth. Being put off is not recorded. Each IDE session's `opened` carries the profile at that moment. Answers given later join earlier sessions by participant ID.

## Settings

`/settings` is the one place for everything about the account; the status bar's settings link leads there. Its commands: `profile` (every question on one form, current answers ticked, saved with one button), `privacy` (going stealth), `export`, `import`, `logout`, `reset` and `delete`. Each command is its own page (`/settings/privacy`), in the terminal's look: what it does, where things stand, one line saying what happened, then its actions as a prompt's choices (↑↓ or j/k and Enter, a digit, y/n on a confirm, Esc back to settings; every row also clicks). `/settings` lists them as rows in two groups (your data, account). Reset asks once more before acting; delete is enabled once `delete` is typed. A single profile question has its own page too (`/settings/profile/languages`, `/settings/profile/editor`), for links from where the answer matters. Older `?run=` links redirect to these pages. Logging out keeps everything in the browser; the consent page then offers to sign back in as the same handle instead of doing it silently.

There are no accounts, so a backup file is how practice moves between browsers or survives clearing one (`apps/web/lib/backup.ts`). `export` downloads everything this browser holds: the localStorage entries under `muscle-memory.*` (profile, board, settings) and the practice store (participant ID, device secret, referral code, every record, and the upload queue in order). The file carries the device secret, which can delete uploaded data, and says so. `import` checks the file first, shows whose it is, warns when this browser has practice of its own that would be lost (and with it the key to delete its uploads), and on confirmation replaces everything and reloads. Records already uploaded are not sent again; queued ones are, under the same participant ID.
