/** Local bulk-archive sink. Stable filenames make write-before-ack retries idempotent. */
import { open, mkdir, readFile, readdir, link, unlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
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
    await syncDirectory(root);
  } finally {
    await unlink(temporary);
  }
}

async function syncDirectory(root: string): Promise<void> {
  const directoryHandle = await open(root, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

/**
 * Removes the archive file and any leftover temporary file for one event, directly
 * inside `directory`. Never follows paths: the name comes from a validated ID and
 * unlink removes a symlink itself, not its target. A missing file is success.
 */
export async function removeArchivedEvent(
  directory: string,
  eventId: string,
): Promise<void> {
  safeIdentifier(eventId);
  const root = resolve(directory);
  let names: string[];
  try {
    names = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const temporary = new RegExp(
    `^\\.${eventId.replaceAll(".", "\\.")}\\.[0-9a-f-]{36}\\.tmp$`,
  );
  const owned = names.filter(
    (name) => name === `${eventId}.json` || temporary.test(name),
  );
  for (const name of owned) {
    const path = join(root, name);
    if (dirname(path) !== root)
      throw new Error("Refusing path outside archive.");
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Make the removal durable before storage records it as complete.
  if (owned.length) await syncDirectory(root);
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
