# Optional device-local practice

Practice stays session-only unless the player explicitly checks **Save practice history on this device**. Enabling it opens local IndexedDB; it does not send records to an application server, researcher or analytics service. A separate session consent checkbox starts practice. Saved events use `device-local-practice-v1` as their operational consent scope and keep research consent false.

The browser adapter stores complete versioned `attempt.assessed` envelopes with task/context snapshots, answers, assistance disclosure, timestamps and provisional feedback. It creates a random device-local pseudonym only when saving is requested. It acknowledges an append only after the IndexedDB transaction commits. Identical retries deduplicate; conflicting payloads under the same event ID fail. A failed UI save retains the same event for retry until the player changes answers or context.

Saved feedback can be reviewed after reopening the page and opting into local history again. Browser storage can be evicted or cleared, so local history is not a cross-device backup or a server durability promise.

**Download local events** produces JSONL with stable event IDs and immutable snapshots. A browser download is not proof that a file reached disk, so it does not acknowledge or remove pending events. Downloads remain repeatable and downstream consumers can deduplicate by event ID. The local CLI archive adapter separately demonstrates verified write-before-ack behavior.

Since database version 2, the same database also holds [workspace](workspace.md) observations and code revisions when the workspace's device option is chosen. Clearing from either page removes attempts, workspace records and the identity together.

**Clear saved practice and identity** atomically removes saved events, pending export data and the local pseudonym, then clears the visible result and requires starting practice again. It cannot remove files already downloaded elsewhere. Another open tab can create new practice records after the clear operation. Nothing is published or shared for research by these actions.

Focused IndexedDB tests cover commit/reopen, stable identity, duplicate/conflicting retries, repeatable export and atomic clearing. Safari verification on the local Workers build covered opting in, saving a four-fixture result, reopening to find it, and clearing the synthetic record back to zero. This is a local development slice; hosted identity, participant study consent, remote retention/deletion and catalog enforcement are separate Foundation work.
