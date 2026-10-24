# Evidence before interpretation

How Muscle Memory records practice. Two primitives underpin the data model:

- **Immutable content.** Every issue revision a player works against is stored once under the SHA-256 of its content, with its repo, cases, teammate comments and hints ([issue model](issue-model.md)). Recorded data names the revision, so it can always be read against exactly what the player saw.
- **Ordered observations** of disclosed activity inside the IDE and on the board. Each observation has a stable ID, schema version, source sequence, client occurrence time and (once there is a server) a receipt time. Gaps, dropped capture and truncation are explicit.

What the [workspace](workspace.md) and the [board](board-activity.md) record today: every key pressed in the IDE's editors with its timing, editor transactions with recovery snapshots, cursor moves, scrolling, focus, copies and cuts, the type help shown, files and panels opened, page visibility, the runtime, runs with their raw bounded outcomes, pull requests and their pushes, teammate comments, review threads and hints as they are released, every page of the tracker viewed with its search and filters, replies to review comments, profile answers, and board moves, including merging. All of it is stored on the device first and uploaded when an ingest endpoint is configured ([telemetry](telemetry.md)).

## Capture boundary

Lossless means within the declared capture, size and retention boundary. It does not guarantee deterministic replay under every environment. Capture stays inside the IDE and the board: no unrelated browsing or clipboard history. Detailed editing capture is disclosed in the Terms and Privacy Notice accepted at `/consent` or `/play` ([legal](legal.md)). Immutable while retained does not mean undeletable: `reset` and `delete` in Settings remove it.

Keep bounded original evidence even when execution or checking fails. Normalised outputs and pass counts never replace the raw outcome. If evidence exceeds a limit (64 KiB of UTF-8 per code revision or output, cut at a character boundary), record what was omitted instead of silently calling it complete.

## Derived assessments

Pass counts, scores, skill estimates, flags and rankings are interpretations. They are recomputed from the stored observations and the revision they name, and are never written back into evidence. A change to how something is computed is a new, versioned interpretation, not an edit to earlier results. Comparative scoring stays provisional until calibrated on real, consenting players.

## Source order

A source stream is one participant's one source ID: one page load of the IDE (`workspace-<uuid>`) or the board (`board-<uuid>`). Positions start at 1, are positive safe integers and never reset; a new page load is a new source. `packages/domain/source-order.ts` reads a stream by sequence, not arrival, and reports missing ranges before the highest captured sequence (the first 100, with totals). A missing position was not observed: it is not evidence that nothing happened. A late arrival for a free position is a new record; it never rewrites earlier observations.

## Remaining gaps

Uploaded rows carry the server's receipt time (`received_at`). Not recorded: pointer movement and hovering (except type tooltips), layout resizing, keystrokes in the tracker's text fields (their results are), menus opened without a choice, and anything in other tabs or apps (only that the page was hidden or lost focus). Writes still buffered when a page closes can be lost. Each stream's `elapsedMs` orders its own events exactly; across streams only the wall clock (`occurredAt`) lines them up. The consent boundary is the Privacy Notice ([legal](legal.md)); it needs a lawyer's review before launch.
