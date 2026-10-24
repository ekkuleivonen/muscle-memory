# Python workspace preview

`/workspace` lets a player write `frequency_map` in Python, run it against the fixtures and see practice feedback. It uses Challenge `frequency-map@2.0.0`: the same fixtures as the published JSON-output version `1.0.0`, which stays unchanged, plus a Python runtime, entry point and starter code. Scoring uses assessment `1.0.0`: each returned value must equal the expected output as canonical JSON. There is no Adventure story change, no account and no upload.

## Runtime isolation

Submitted code never runs in the app's JavaScript context, in Node or on a server.

- **Sandbox.** Each run gets a new `sandbox="allow-scripts"` srcdoc iframe. That gives an opaque origin with no access to the app's DOM, cookies, localStorage or IndexedDB. Inside it, a classic dedicated worker runs Python.
- **No network.** The frame's CSP is `default-src 'none'; connect-src 'none'; script-src '<boot-hash>' blob: 'wasm-unsafe-eval'; worker-src blob:`, plus `'none'` for every other fetch directive. Blob workers inherit it. There is no `unsafe-eval`.
- **Runtime files.** The runtime is Pyodide `314.0.7` (Python 3.14.2), pinned in `package-lock.json` and `packages/runner/runtime-manifest.json`. The `predev`/`prebuild` step `tools/copy-python-runtime.mjs` copies four files (about 13 MB) from `node_modules` into the app's static assets and verifies their SHA-256 hashes. Nothing loads from a CDN.
- **Loading inside the sandbox.** Only the trusted app page fetches the files. It uses its own origin only (`mode: "same-origin"`; an asset base on another origin is refused) and the site's existing sign-in, such as the Cloudflare Access cookie on the owner preview (`credentials: "same-origin"`). Subresource Integrity checks every file. Any redirect, for example to a sign-in page after the session expires, fails closed instead of being followed. The page then posts the bytes into the frame; the sandbox never sees credentials and makes no requests. The worker answers Pyodide's file reads from memory. Only the standard library is available: the package lock is empty, so other imports fail without any request.
- **Timeout and cancel.** A finished, timed-out (5 s) or cancelled run destroys its iframe, which ends the worker and anything it started. A spare sandbox boots in the background, so every run starts with a fresh interpreter.
- **Results.** The worker returns raw results only: exceptions and tracebacks, `repr` and `json.dumps` of each return value, and stdout/stderr bounded to 64 KiB each with byte counts. Expected outputs never enter the sandbox. The app validates and bounds every message and renders all of it as text.
- **Conversion failures.** Turning a return value into `repr` and JSON runs user code too. A failing `__repr__`, an unprintable exception, a value nested more than 500 levels deep or cyclic, or one holding more than 1,000,000 nested items, which is too many to inspect, becomes a per-case `conversionError`, and earlier cases are kept. A value that cannot be inspected completely is refused, never assumed shallow. The depth limit exists because CPython's C-level `repr`, `json.dumps` and deallocation of very deep containers exhaust the wasm stack before Python's own recursion guard fires. For the same reason, returned values stay referenced until the sandbox is destroyed.
- **Failing closed.** If the runtime cannot load (hash mismatch, missing file, blocked worker, boot timeout), Run stays unavailable and the error is shown as a runtime failure, never as a user error.

`npm run test:browser` checks this in a real Chromium. The isolation check serves the runtime only with a synthetic HttpOnly sign-in cookie. It verifies that a signed-in page boots and runs, and that a missing or expired sign-in, a tampered file or a foreign asset base all fail closed, never following the sign-in redirect or sending the cookie elsewhere. Run `npm run build:cloudflare` first; the workspace half starts a local `wrangler dev` preview and never deploys.
- `tools/browser/sandbox-check.mjs` tries, from Python:
  - `fetch` to the app origin, another origin and a private address; XHR, WebSocket and EventSource.
  - `importScripts`, `eval`, and a fetch from a nested worker.
  - IndexedDB, caches, cookies, `document` and `parent`.
  - It also probes the frame document directly.
  - Two local servers must receive no request, while a positive-control normal worker does reach them.
  - It also covers timeout, cancel, clean reruns, output flooding and tampered assets.
- `tools/browser/workspace-check.mjs` drives the built app through a Workers preview:
  - Edits, a normal run, syntax and runtime errors, truncation, timeout and cancel followed by reruns, an edit during a run (stale result), undo/redo/selection and typing responsiveness.
  - Device persistence: lifecycle order, correlation, no gaps, injected IndexedDB failures with retry, buffer overflow with a disclosed gap, recovery after reload and clear.
  - A tampered runtime.

Limits:
- **Memory and CPU.** There is no hard per-run memory quota in browsers; only wasm's own memory ceiling applies, and the timeout or cancel destroys everything. CPU is bounded by the 5 s timeout.
- **Startup.** The first run downloads about 13 MB; every run boots a fresh interpreter, about 2 s in headless Chromium.
- **Browsers.** Firefox and Safari/WebKit were not verified here: this host lacks their system libraries.
- **Engine stack.** If user code itself builds and frees a container nested about 3,000 or more levels deep, the wasm stack is exhausted. The run is then reported as a runner error and its cases are lost. Python-level recursion raises a normal `RecursionError`.
- **Forged results.** Python can forge result messages to its own frame, because tests run in the same interpreter. Feedback is practice only, not anti-cheat.
- **Tab focus.** Tab indents inside the editor; Escape then Tab, or Ctrl-M (Shift-Alt-M on macOS), moves focus out.

## Editor

CodeMirror 6 with an explicit extension list (`apps/web/app/workspace/editor.ts`):
- Python highlighting and indentation, Tab indenting 4 spaces, undo/redo history, bracket-match highlighting, line numbers, and Mod-Enter to run.
- No autocompletion, auto-closing brackets, linting or AI assistance.

The editor owns its document, so typing does not re-render React, and work survives runs, errors, timeouts and cancels.

## Captured activity

Opening the workspace shows what is recorded and needs explicit acknowledgement. There are no global keyboard, clipboard or page listeners. Capture comes from CodeMirror transactions and the run lifecycle only. Contracts live in `packages/domain/workspace.ts`.

- **Stream.** A page load is one source stream, `workspace-<uuid>`; a reload starts a new one. Each observation has a stable ID `<source>.<sequence>`, client `occurredAt`, an explicit absent server receipt, the capture version `workspace-capture-1.0.0`, a consent version, `researchConsent: false` and the Challenge artifact ID.
- **`opened`.** Records the editor feature list, the runtime version and declared capture gaps: selection-only changes, focus and scroll, activity outside the editor, timing within a transaction, and active time.
- **`edit`.** One per document-changing transaction, with the CodeMirror change set (up to 16 KiB), the user event (`input.type`, `input.paste`, `undo`, ...), the selection and the document length. Text pasted into the editor is part of the change; the clipboard itself is never read.
- **`snapshot`.** References a participant-owned `artifact.code-revision` (bounded to 64 KiB with byte counts and truncation). Snapshots are taken on open, every 25 edits, after an oversize edit and on every run.
- **`run`.** Records `queued`, `running`, then `result`, `user-error`, `runner-error`, `timeout` or `cancelled`. Each carries the run ID, the exact code revision and its artifact, runtime and timeout. The terminal status holds the raw bounded outcome. A result for an earlier revision is shown as stale and never as feedback for the current code.
- **`capture-gap`.** Records an explicit lost position range (`buffer-full` or `write-conflict`).

Feedback is derived from the stored run outcome when shown. It is not stored, and a raw failure is kept whether or not it can be scored.

`packages/capture/recorder.ts` assigns positions immediately and writes ordered batches asynchronously, so storage never blocks typing.
- **Buffer.** It holds up to 1,000 records or 4 MiB. Failed writes keep the records and retry with backoff under the same IDs, so partial writes deduplicate. A changed payload under an existing ID is a conflict and is never overwritten.
- **Overflow.** When the buffer is full, the observation and the artifact it would add are dropped, but their position stays used. Once there is room, a `capture-gap` observation discloses the exact range. Typing stays responsive through all of this.
- **Storage.** By default records live in the tab's memory. **Save workspace activity and code on this device** writes them to the existing device-local IndexedDB database, now version 2 with a `workspace` store; saved attempts are kept on upgrade.
- **Restore.** On reopening with device storage, `packages/capture/restore.ts` rebuilds the latest saved code exactly, using only this participant's records for this Challenge.
  - Each source stream (page load) is replayed on its own and streams are never combined. Replay starts from a complete code artifact (the opening document or a snapshot) and applies saved CodeMirror change sets in strict source order, checking each revision and document length.
  - Replay stops at a missing position, a disclosed capture gap, a duplicate position, or a truncated, missing or invalid change or snapshot. The last exact document is restored, and the page says which revision was recovered and that later saved changes were not. A later complete snapshot is a new safe starting point.
  - The stream with the most recent saved activity is used. If it has nothing recoverable, an earlier session's code is used and labelled as such.
- **Save state.** The page shows whether code is kept in this tab only, still being saved, failing and retrying, or affected by a capture gap. "All edits so far are saved on this device" appears only when nothing is waiting to be written. Edits still waiting when a page closes abruptly are not recoverable; recording never blocks typing to wait for storage.
- **Clear.** Clearing first stops capture and waits for any write in flight, then clears the tab's memory or the device database. On the device this removes attempts, workspace records and the local identity together.

Not included: editor timelines beyond transactions, keystroke timing, participant uploads, exports of workspace records, server receipt, research collection or analytics. Copies made outside the browser need separate deletion, and browser storage can be evicted.
