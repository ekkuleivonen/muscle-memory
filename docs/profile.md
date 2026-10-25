# The profile and its questions

There is no onboarding. Accepting the current Terms is the only thing any page needs (one click at `/consent`, or picking a language on `/play`); after that, the app asks about you where an answer matters, one question at a time, and never insists.

## The questions

The questions live in `apps/web/lib/questions.ts` (experience, how often you code with AI, languages, goal, editor keys). Each place that asks shows the first of its questions still open, with a line on why it matters there:

| Where | Asks | `from` |
| --- | --- | --- |
| A merged pull request, after its outcome | experience, AI use | `result` |
| The dashboard, beside suggestions | languages | `dashboard` |
| An issue page, under Start work | editor keys (the IDE opens with them) | `issue` |
| Settings (individual controls or terminal `profile`) | all of them, to change answers | `settings` |

A question is **open** while it has no answer and is not put off (`isOpen` in `apps/web/lib/profile.ts`). "Not now" puts it off on this device for three days (`SNOOZE_MS`), everywhere, and then it may come back; the place that asked stays quiet for the rest of that visit, so declining never brings on another question. Answering moves on to the next open one. The languages question stays open until the person answers it: the five-minute test's language seeds the answer as a guess (`from: "play"`) but does not close it.

Adding a question: add it to `QUESTIONS` and to `Profile`, give it a reason in `ask.tsx`, and put `<Ask ids={[...]} from="..." />` where it is relevant (a new place needs a new `from` in `PROFILE_SOURCES`, `packages/domain/board.ts`, and a capture version bump).

## What is recorded

Every answer records `observation.board.profile` ([board activity](board-activity.md)) with the place that asked and the whole profile as saved: every answer, which ones the person gave themselves (`answered`), and stealth. Being put off is not recorded. Each IDE session's `opened` carries the profile at that moment. Answers given later join earlier sessions by participant ID.

## Settings

`/settings` is a terminal, the one place for everything about the account; the sidebar's Settings link leads there. Its commands: `theme` (light, dark or the system's; kept in this browser and applied before the first paint, see `apps/web/lib/theme.ts`), `profile` (every answer, Esc keeps the current one), `privacy` (going stealth), `export`, `import`, `logout`, `reset` and `delete`. Links from elsewhere open it on one command with `?run=`: a command (`?run=privacy`) or a single profile question (`?run=languages`, `?run=editor`). Logging out keeps everything in the browser; the consent page then offers to sign back in as the same handle instead of doing it silently.

There are no accounts, so a backup file is how practice moves between browsers or survives clearing one (`apps/web/lib/backup.ts`). `export` downloads everything this browser holds: the localStorage entries under `muscle-memory.*` (profile, board, settings) and the practice store (participant ID, device secret, referral code, every record, and the upload queue in order). The file carries the device secret, which can delete uploaded data, and says so. `import` checks the file first, shows whose it is, warns when this browser has practice of its own that would be lost (and with it the key to delete its uploads), and on confirmation replaces everything and reloads. Records already uploaded are not sent again; queued ones are, under the same participant ID.
