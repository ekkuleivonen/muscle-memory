# The five-minute test and sharing

How people arrive from a shared link, and how a result gets shared. The goal is the shortest path from a post to code in an editor, with every attempt still recorded under accepted Terms.

## The test (`/play`)

- One small bug, the same in eight languages: the quick fixes project (`QUICK-1` to `QUICK-8`, "The composer says 1 word when the post is empty"), in Python, JavaScript, TypeScript, Go, Java, C#, Ruby and PHP. The project is **unlisted** (`listed: false` on the project, live metadata): it stays out of the platform's issue lists, suggestions and project index, and its issues open by key.
- `/play` is public. It shows the ticket and a language picker; the language a shared link names (`?lang=go`) comes first.
- **No setup questions.** Picking a language accepts the current Terms (the line above the buttons says so, including that every keystroke is recorded) and opens `/work/QUICK-n`. The acceptance is stored like any other, with a play-only profile, and the `mm_play` cookie lets its holder into the IDE and pull requests (`requireConsent`), not the platform (`requireOnboarding`).
- **The language picked is the languages answer.** It is saved into the profile when the profile has none, so every IDE session's profile snapshot carries it, and recorded as a `profile` event with `from: "play"`, the same event onboarding records.
- **Joining the platform later** (the dashboard, board or issues) goes through onboarding, which sees the signed Terms and asks only the questions. The answers then join the play sessions by participant ID.

## The result card

Merging a pull request shows what happened: the issue, the language, the minutes the person was typing, reading or testing (distinct active minutes), the test runs, pushes and hints. Nothing ranks anyone. `apps/web/lib/result.ts` computes it from this browser's records.

Sharing (copy link, X, LinkedIn, or the system share sheet) makes a link `/r/<card>`: the card, base64url-encoded in the path, plus this device's **referral code**, a random code separate from the participant ID. The link is a brag, not a record: anyone could edit it, so nothing trusts it.

## The shared page (`/r/<card>`)

Public. It shows the card, a preview image for posts and chats (`opengraph-image.tsx`, 1200×630), and "Your turn", which leads to `/play?ref=<code>&lang=<language>`. A link that does not decode to a card we would have made goes to `/play`.

## Measuring the loop

Nothing is recorded before the Terms are accepted, so visits that never start are not counted (a declared gap). Afterwards:

- `arrived` (once per browser): the first landing page, when, and the referral code that brought the person, if any. It is remembered in the browser from the moment of landing and recorded when the Terms are accepted.
- `shared`: which card, through which channel, with the sharer's referral code.

Joining `shared.ref` to `arrived.ref` gives shares, the arrivals each brought, and from those people's own records whether they started, finished and shared in turn.
