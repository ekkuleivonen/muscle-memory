# Board activity

Setting an issue's status by hand (Backlog, Todo or In progress, from its Status menu) is recorded as raw evidence of what people choose to work on. Done is never set by hand. There is no separate switch: every account records moves under the [Terms and Privacy Notice](legal.md) it accepted during onboarding, and each move carries that version. Records made before this (`board-activity-device-v1` to `v3`, under the old opt-in) stay as stored.

## What is recorded

`observation.board.moved` (`packages/domain/board.ts`), capture version `board-capture-1.2.0`, in the same envelope as [workspace observations](workspace.md): stable ID `<source>.<sequence>`, one source stream per page load (`board-<uuid>`), client `occurredAt`, an explicit absent server receipt, `consentVersion` set to the accepted Terms version (`terms-2026-10-24`), `researchConsent: false` and the exact Challenge shown as `challenge.<id>.<version>`. Data:

- `issueKey` (`API-2`), `from` and `to` (`backlog`, `todo`, `in-progress`)
- `via`: `pointer` or `keyboard` (the Status menu opened with `s` and driven by arrows)
- `onBoardBefore`: how many issues were on the board (Todo and In progress) just before
- `nudged`: whether the soft limit asked "finish one first?" first

Records made under `board-capture-1.1.0` (opt-in) and `1.0.0` (backlog ↔ Todo; `via` button, status-field or keyboard; `todoBefore`) stay as stored.

Declared gaps: issue views, searches and filters, time on page, and anything other than board moves. A missing source position was not recorded; it is not evidence that nothing happened.

## Storage and deletion

Records go to the device-local IndexedDB database used by the workspace, under the same random pseudonym, with the same write rules: identical retries deduplicate and a different payload under an existing ID is refused. A failed write is retried with the next move and otherwise leaves a gap. Settings' **Reset progress** and **Delete account** delete them with the rest of the device data. Nothing is sent to a server yet.
