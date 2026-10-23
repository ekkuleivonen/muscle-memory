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

The focused tests cover reopen/retry, conflicting event IDs, full context snapshots, write-before-ack failure and conflicting archive preservation. They use disposable synthetic fixtures. There is no real participant identity, public individual-results endpoint, analytics pipeline, retention schedule or deletion service in this slice. Those boundaries must be implemented before collecting real participant records; do not use this CLI for real user data.
