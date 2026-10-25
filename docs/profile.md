# The profile and its questions

There is no onboarding. Accepting the current Terms is the only thing any page needs (one click at `/consent`, or starting from quick start); after that, the questions wait in settings and nothing insists on them.

## The questions

Every question is optional and answered with a category, never free text, so groups can be compared without singling anyone out. They live in `apps/web/lib/questions.ts`, in this order:

| Id | Asks |
| --- | --- |
| `experience` | how long they have been writing code |
| `role` | what they do: student, software, data or ML, infrastructure, testing, engineering manager, something else |
| `learned` | how they mostly learned: a degree, a bootcamp or course, on their own, on the job |
| `context` | where they write code most: an established company, a startup, freelance, open source, school, for themselves |
| `languages` | the languages they will work with (several) |
| `aiUse` | how often they code with AI help |
| `aiTools` | what they use AI for: completion, chat, agents, review, or none of these (several) |
| `aiShare` | about how much of the code they ship an AI wrote |
| `goal` | what brings them here |
| `touchTyping` | whether they type without looking at the keys |
| `age` | an age band (16–24 up to 55 or older), never a birth date |
| `editor` | editor keybindings: standard or Vim |

They are asked in settings (`/settings/profile`, every question on one form, or one at `/settings/profile/<question>`). Quick start saves the language picked as a first guess at `languages` when there is none; that guess does not count as the person's answer.

Adding a question: add it to `QUESTIONS` and to `Profile` (`apps/web/lib/profile.ts`); the settings form shows it. Say in the Privacy Notice that it is asked, which means a new legal version ([legal](legal.md)).

## After completing

Practice asks three more, about the attempt just completed, each one click and all optional: how hard it was (too easy, about right, hard, too hard), how sure they were before submitting that it would pass (sure, fairly sure, unsure, guessing), and whether at work they would have used AI for it (yes, maybe, no). Each answer is recorded as `practice.answered` with the attempt; answering again records again, and the latest stands (`AFTER_QUESTIONS` in `packages/domain/practice.ts`).

## What is recorded

Every save records `site.profile` ([telemetry](telemetry.md)) with where it was given (`settings` or `quick-start`) and the whole profile as saved: every answer, which ones the person gave themselves, and stealth. Each practice session's `practice.opened` carries the profile at that moment. Answers given later join earlier sessions by participant ID.

## Settings

`/settings` is the one place for everything about the account; the status bar's settings link leads there. Its commands: `profile` (every question on one form, current answers ticked, saved with one button), `privacy` (going stealth), `export`, `import`, `logout`, `reset` and `delete`. Each command is its own page (`/settings/privacy`), in the terminal's look: what it does, where things stand, one line saying what happened, then its actions as a prompt's choices (↑↓ or j/k and Enter, a digit, y/n on a confirm, Esc back to settings; every row also clicks). `/settings` lists them as rows in two groups (your data, account). Reset asks once more before acting; delete is enabled once `delete` is typed. A single profile question has its own page too (`/settings/profile/languages`, `/settings/profile/editor`), for links from where the answer matters. Logging out keeps everything in the browser; the consent page then offers to sign back in as the same handle instead of doing it silently.

There are no accounts, so a backup file is how practice moves between browsers or survives clearing one (`apps/web/lib/backup.ts`). `export` downloads everything this browser holds: the localStorage entries under `muscle-memory.*` (profile, progress, stars, settings) and the practice store (participant ID, device secret, referral code, every record it still keeps, and the upload queue in order). The file carries the device secret, which can delete uploaded data, and says so. `import` checks the file first, shows whose it is, warns when this browser has practice of its own that would be lost (and with it the key to delete its uploads), and on confirmation replaces everything and reloads. Records already uploaded are not sent again; queued ones are, under the same participant ID.
