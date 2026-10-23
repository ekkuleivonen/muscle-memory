/** Local bulk-archive sink. Stable filenames make write-before-ack retries idempotent. */
import { open, mkdir, readFile, link, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { EventOutbox } from "./contracts";
import { safeIdentifier } from "../domain/events";

export async function writeEvent(
  directory: string,
  eventId: string,
  payload: string,
): Promise<void> {
  safeIdentifier(eventId);
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const destination = join(root, `${eventId}.json`);
  const temporary = join(root, `.${eventId}.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(payload + "\n", "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    try {
      await link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if ((await readFile(destination, "utf8")) !== payload + "\n")
        throw new Error(
          `Export conflict for ${eventId}; existing archive was preserved.`,
        );
    }
    const directoryHandle = await open(root, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await unlink(temporary);
  }
}

export async function exportPending(
  store: EventOutbox,
  directory: string,
  write = writeEvent,
): Promise<number> {
  let exported = 0;
  for (const event of store.pending()) {
    await write(directory, event.eventId, event.payload);
    // A crash/failure here leaves the event pending; retry verifies the existing file.
    store.acknowledge(event.eventId, event.payload);
    exported++;
  }
  return exported;
}
