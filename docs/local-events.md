# Durable reference events and local export

This slice stores synthetic reference data, separate from the browser-only app. It does not enable participant collection or research consent.

With Node.js 22.22+:

```sh
npm run demo:events
npm run demo:events
```

The first run appends one versioned event and exports one JSON object. The second run reports `duplicate: true` and `exported: 0`. The default data directory is `private/reference`, ignored by git. Pass another local directory with `npm run demo:events -- /path/to/private/reference`. Keep one archive destination per store; this minimal outbox does not track multiple independent sinks.

`packages/domain/events.ts` builds an `attempt.assessed` envelope with event/schema versions, pseudonymous participant ID, consent version, exact Adventure and Challenge snapshots, encounter context and immutable assessment output. The factory copies content and only accepts a supported scoring formula. No old result is silently recomputed with current content.

`packages/storage/sqlite.ts` persists the event and its pending-export flag in one transaction using Node's built-in SQLite. Identical retries return the original receipt; a conflicting payload under the same ID fails. A failed insert leaves neither event nor pending export. SQLite WAL and full synchronization support restart recovery.

`packages/storage/export.ts` is a separate local archive adapter behind a small outbox interface. It syncs a private temporary file and links it atomically under a stable event filename, then acknowledges storage. If the process stops after writing but before acknowledgment, retry verifies the same bytes and acknowledges without a duplicate. Conflicting archive content remains untouched and the event stays pending. This local sink uses a filesystem with hard-link and directory-sync support, as verified on macOS and in Linux CI. A future object-storage sink should preserve the same conditional-write/retry behavior.

This is local tooling, not the Cloudflare runtime adapter. `node:sqlite` remains experimental on the Node 22 baseline and is not imported into the Next.js app. A Cloudflare transactional adapter can implement the same event/outbox boundary separately from bulk R2 or other archive storage.

## Participant deletion

Delete one participant's local events and owned archive files from the same data directory:

```sh
npm run delete:participant -- synthetic-participant-1
npm run delete:participant -- synthetic-participant-1 /path/to/private/reference
```

The command prints `complete`, `remainingFiles` and `errors`, and exits non-zero when deletion is incomplete. In code, call `deleteParticipant(store, participantId, archiveDirectory)` from `packages/storage/deletion.ts`.

1. One SQLite transaction deletes the participant's event payloads, both pending and already exported, records each event's archive file for removal and retires the participant ID. From then on, `pending()` cannot return those events, and `append` rejects the retired participant and any event ID still awaiting file removal. Export and demo reruns therefore cannot recreate the records.
2. For each owned event, the archive adapter removes `<eventId>.json` and leftover `.<eventId>.<uuid>.tmp` files directly inside the configured archive directory. Then it syncs the directory and records the file as removed. Names come from validated identifiers, not user paths. A symlink at an owned name is removed without touching its target. A missing file or directory counts as success.
3. If a file cannot be removed, the result reports it and its pending-removal row stays in SQLite. Rerunning the same command, including after a restart, retries only those files. Repeating a completed deletion is a no-op.

Unrelated participants, their files and other files in the archive directory are untouched.

Limits:

- Database and filesystem are not removed atomically together. Between the transaction and successful file removal, archive files may still exist. The result says so instead of reporting success.
- Copies made outside the configured archive directory are not tracked. This includes shared, synced or backed-up exports and any other sink, and each copy needs separate deletion.
- SQLite deletion is logical. Freed pages, WAL contents, filesystem journals and backups may retain bytes until overwritten. This is not forensic or secure erasure.
- Retired participant IDs remain in SQLite to block re-append. Event IDs remain only until their files are confirmed removed. Use a new pseudonymous ID for new synthetic data. Once `synthetic-participant-1` is deleted, `npm run demo:events` fails for that data directory; use a fresh directory.
- Run deletion only while no export of the same store is in progress. This single-process tool has no cross-process locking. An export that already read an event could still write its archive file after deletion finishes. Its acknowledgment would fail, but that file would not be tracked for removal.
- The browser's IndexedDB clear is separate and unchanged.

The focused tests cover reopen/retry, conflicting event IDs, full context snapshots, write-before-ack failure, conflicting archive preservation, and two-participant deletion with an injected file-removal failure, reopen and retry. They use disposable temporary directories and synthetic fixtures. There is no real participant identity, public individual-results endpoint, analytics pipeline, retention schedule or production deletion service in this slice. Do not use these CLIs for real user data.
