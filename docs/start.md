# Getting started, and sharing

The ways in, and how a result or a challenge gets shared. Every way in leads to the same loop: challenge, code, feedback, the next challenge.

## Ways in

- **`/`**, public: what this is, in one screen, **try your first challenge →** to quick start and **explore all challenges** to the list. The manifesto (`/manifesto`, "I read code every day. Then I tried writing some.") tells the story behind it, why the founder wants to keep being able to write code unaided, and what the data can and can't say.
- **Quick start (`/start`)**, public: pick a language and get an easy challenge in it at once, the easiest one this device hasn't completed (`apps/web/lib/quick-start.ts`). The language a link names (`?lang=go`), or the profile's first, is offered first and highlighted, so Enter starts it. Starting accepts the Terms for someone new (the line above the list says so, including that every keystroke is recorded); the language picked is saved as a first guess at the profile's languages when there is none ([profile](profile.md)). Practice records the start as from `quick-start`.
- **The list (`/challenges`)**: every challenge in one picker, like fzf. Type to narrow (plain words, or `lang:python`, `difficulty:easy`, `tag:strings`, `is:starred`, `is:completed`, `sort:`), toggle the filters, move with ↑↓, star with Ctrl-s, and read the highlighted challenge's task and examples in the preview. Easiest first. Clicking a row keeps list navigation active; Tab reaches the filters and preview, and filter toggles retain focus. `/` returns to search only while the picker has focus. Enter opens practice, which records the start with the search and the position picked.
- **A challenge's URL (`/challenges/<KEY>`)** opens practice on it directly: its attempt if there is one, otherwise a new one started `direct`. **Copy challenge link** in practice copies it; it never carries anyone's code or attempt.
- **A shared result (`/r/<card>`)**, public: below.

Accepting the current Terms is the only thing any page requires (`requireConsent`). Someone who has not (a deep link, or the Terms changed since) is sent to `/consent`: the Terms in four points and one choice (Enter, `y` or a click), then on to the page they were heading for. `/start` does the same inline. There is no onboarding: the profile questions are in settings, and nothing insists on them.

## Sharing a result

After completing, practice offers **Share result**: a preview of exactly what a post or chat will show, then copy link, X, LinkedIn or the system share sheet. The link is `/r/<card>`, a version 3 card (`apps/web/lib/outcome.ts`) built only from the attempt's recorded completion and submissions: the challenge key, language and checked revision, the completing submission's checks, optionally the first submission's (when its cases were decided) and how many submissions ran, and this device's **referral code** (random, separate from the participant ID). Never timing, speed, ranks or comparisons, and never "without AI" as a fact: the editor's lack of AI features is described as a practice condition. Only allowlisted fields are encoded (`publicOutcome`). The link is a brag, not a record: anyone could edit it, so nothing trusts it.

**Code is left out unless the person ticks "Include my code"**, which starts unticked every time. Ticked, the editable file exactly as the completing run checked it (never the editor's current code) goes into the link's fragment, deflated (`/r/<card>#code=…`, `apps/web/lib/share.ts`): browsers never send a fragment to the server, so nothing stores it. A file kept only in part, or code over the size limits, is refused with a message saying why, never cut.

**The shared page** reads "Completed “<title>” (<KEY>) in <language>. All <n> checks passed.", says when it was completed on an earlier revision than the live one, shows a preview image with the same sentence (1200×630), any included code collapsed as plain text, and **Try <KEY> yourself**, which opens practice on the same challenge in the visitor's own attempt (through `/consent` for someone new), recorded as started from `link`. A link that cannot be shown says why and invents nothing: incomplete (including any card version but the current one), or a challenge that no longer exists.

## Measuring the loop

Nothing is recorded before the Terms are accepted, so visits that never start are not counted (a declared gap). Afterwards ([telemetry](telemetry.md)):

- `site.arrived` (once per browser): the first landing page, when, and the referral code that brought the person. It is remembered from the moment of landing and recorded when the Terms are accepted.
- `site.shared`: which card, through which channel, with the sharer's referral code.
- `practice.started`: where each attempt came from.

Joining `shared.ref` to `arrived.ref` gives shares, the arrivals each brought, and from those people's own records whether they started, completed and shared in turn.
