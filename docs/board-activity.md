# Board activity log

Setting an issue's status by hand (Backlog, Todo or In progress, from its Status menu) can be recorded as raw evidence of what people choose to work on. Done is never set by hand. It is **opt-in**: setup shows the disclosure below and asks `Keep the activity log? (y/N)`, defaulting to no. Settings (`/settings#privacy`) turns it on or off later, and the board page always shows whether it is on.

> Keep a private activity log? Each time you change an issue's status (Backlog, Todo, In progress), it records which issue, from and to, when, whether you used the mouse or keyboard, how many issues were on your board and whether you were nudged. It stays in this browser's storage under a random ID. Nothing is uploaded and research sharing is off. Turn it off or delete it any time in Settings.

Consent is stored as `board-activity-device-v3` with its time. Changing what is recorded or the disclosure means a new consent version, which asks again: v1 covered only backlog ↔ Todo, and v2 pointed at terminal commands that no longer exist; neither counts any more.

## What is recorded

`observation.board.moved` (`packages/domain/board.ts`), capture version `board-capture-1.1.0`, in the same envelope as [workspace observations](workspace.md): stable ID `<source>.<sequence>`, one source stream per page load (`board-<uuid>`), client `occurredAt`, an explicit absent server receipt, consent version, `researchConsent: false` and the exact Challenge shown as `challenge.<id>.<version>`. Data:

- `issueKey` (`API-2`), `from` and `to` (`backlog`, `todo`, `in-progress`)
- `via`: `pointer` or `keyboard` (the Status menu opened with `s` and driven by arrows)
- `onBoardBefore`: how many issues were on the board (Todo and In progress) just before
- `nudged`: whether the soft limit asked "finish one first?" first

Records made under `board-capture-1.0.0` (backlog ↔ Todo; `via` button, status-field or keyboard; `todoBefore`) stay as stored.

Declared gaps: issue views, searches and filters, time on page, and anything other than board moves. A missing source position was not recorded; it is not evidence that nothing happened.

## Storage, export and deletion

Records go to the device-local IndexedDB database used by the workspace, under the same random pseudonym, with the same write rules: identical retries deduplicate and a different payload under an existing ID is refused. A failed write is retried with the next move and otherwise leaves a gap. Settings' **Export data** downloads them as `muscle-memory-board-activity.jsonl`, alongside any practice events; **Reset progress** and **Delete account** delete them with the rest of the device data. Nothing is sent to a server.
