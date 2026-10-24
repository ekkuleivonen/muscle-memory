# Board activity log

Moving an issue between the backlog and Todo can be recorded as raw evidence of what people choose to work on. It is **opt-in**: setup shows the disclosure below and asks `Keep the activity log? (y/N)`, defaulting to no. The setup terminal's `log on`, `log off` and `log status` change it later, and the board page always shows whether it is on.

> Keep a private activity log? Each time you move an issue between the backlog and Todo, it records which issue, when, how (button, Status field or keyboard), how many were in Todo and whether you were nudged. It stays in this browser's storage under a random ID. Nothing is uploaded and research sharing is off. log off stops it; data clear deletes it.

Consent is stored as `board-activity-device-v1` with its time. Changing what is recorded or the disclosure means a new consent version, which asks again.

## What is recorded

`observation.board.moved` (`packages/domain/board.ts`), capture version `board-capture-1.0.0`, in the same envelope as [workspace observations](workspace.md): stable ID `<source>.<sequence>`, one source stream per page load (`board-<uuid>`), client `occurredAt`, an explicit absent server receipt, consent version, `researchConsent: false` and the exact Challenge shown as `challenge.<id>.<version>`. Data:

- `issueKey` (`API-2`), `from` and `to` (`backlog`, `todo`)
- `via`: `button`, `status-field` or `keyboard`
- `todoBefore`: how many issues were in Todo just before
- `nudged`: whether the soft limit asked "finish one first?" first

Declared gaps: issue views, searches and filters, time on page, and anything other than board moves. A missing source position was not recorded; it is not evidence that nothing happened.

## Storage, export and deletion

Records go to the device-local IndexedDB database used by the workspace, under the same random pseudonym, with the same write rules: identical retries deduplicate and a different payload under an existing ID is refused. A failed write is retried with the next move and otherwise leaves a gap. `data export` downloads them as `muscle-memory-board-activity.jsonl`, alongside any practice events; `data clear` deletes them with the rest of the device data. Nothing is sent to a server.
