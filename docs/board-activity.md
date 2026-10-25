# Board activity

Setting an issue's status by hand (Backlog, Todo or In progress, from its Status menu) is recorded as raw evidence of what people choose to work on. Done is never set from the Status menu: you merge a pull request whose checks all pass, from its page, which moves the issue to Done for good, and that move is recorded too, as are replies to teammates' review comments on a pull request. There is no separate switch: every account records moves under the [Terms and Privacy Notice](legal.md) it accepted, and each move carries that version.

## What is recorded

`observation.board.moved` (`packages/domain/board.ts`), capture version `board-capture-6.0.0`, in the same envelope as [workspace observations](workspace.md): stable ID `<source>.<sequence>`, one source stream per page load (`board-<uuid>`), client `occurredAt`, an explicit absent server receipt, `consentVersion` set to the accepted Terms version (`terms-2026-10-24`), `researchConsent: false`, and the issue with the revision live at the time (`issue`, `issueRevision`). Data:

- `issueKey` (`API-2`), `from` and `to` (`backlog`, `todo`, `in-progress`)
- `via`: `pointer` or `keyboard` (the Status menu opened with `s` and driven by arrows, Enter on Start work, or the Merge button)
- `trigger`: `status-menu`; `start-work` when Start work on an issue moved it to In progress on the way to the IDE; or `pull-request-merged` for the move to Done when you merge a pull request (only possible once its checks all pass), which also carries the `pullRequest` number and the `runId` of the run that checked it, so the move links to its evidence
- `onBoardBefore`: how many issues were on the board (Todo and In progress) just before
- `nudged`: whether the soft limit asked "finish one first?" first

`observation.board.replied`, in the same envelope, records a reply to a review comment on a pull request's page: `issueKey`, `pullRequest`, the `comment` id (in the revision the observation names), the reply's `text` bounded to 8 KiB at a character boundary, `textBytes` and `truncated`. A reply resolves a blocking thread.

`observation.board.closed` (capture 6.1.0) records closing one of the person's open pull requests without merging it: `issueKey`, `pullRequest`, `via` (pointer or keyboard) and `nudged` (true when the page was suggesting it because another of the issue's pull requests was merged). A closed pull request takes no more pushes and cannot be merged or reopened; the next push from the IDE opens a new one.

Every page of the app is recorded as it is shown (`TrackerActivity` in the root layout):

- `observation.board.viewed`: the `path`, its `query` (searches and filters are GET forms and links, so they arrive here), and the `previous` page in this tab. A page about one issue (the issue page, a pull request, the IDE) names the issue and its live revision; other pages have `issue: null`.
- `observation.board.page`, outside the IDE (which records its own): the page becoming visible or hidden, focused or not, or resized.
- `observation.board.profile`: the whole profile (experience, how often they code with AI, languages, goal, editor, stealth, and which answers the person gave themselves) each time an answer is saved, with the place that asked (`from`: `result`, `dashboard`, `issue`, `settings`, or `play` for the five-minute test's language, a guess). See [profile](profile.md).
- `observation.board.arrived`: once per browser, after the Terms are accepted: the first landing page and when, and the referral code of the shared result that brought them ([the five-minute test](play.md)).
- `observation.board.shared`: a result card shared, with the channel, the card and this device's referral code.
- `observation.board.result`: a merged pull request's result card numbers (metrics version 2, see [the five-minute test](play.md)), the source of the aggregate percentiles.

Every board observation has `elapsedMs`, a monotonic clock from the page load. Declared gaps: visits before the Terms are accepted, keystrokes in text fields (a search is recorded as its query, a reply as the text sent), pointer movement and hovering, menus opened without a choice, activity in other tabs and apps, and writes cut short when the page closes. A missing source position was not recorded; it is not evidence that nothing happened.

## Storage and deletion

Records go to the device-local IndexedDB database used by the workspace, under the same random pseudonym, with the same write rules: identical retries deduplicate and a different payload under an existing ID is refused. A failed write is retried with the next move and otherwise leaves a gap. They are uploaded like workspace records ([telemetry](telemetry.md)). `reset` in Settings clears them from the device; `delete` erases them on the server too.
