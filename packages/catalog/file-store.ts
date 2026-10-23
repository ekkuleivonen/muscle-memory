/** Local JSON catalog persistence. One local author at a time; no locking. */
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyCatalog, verifyCatalog, type Catalog } from "./catalog";

/** Loads and verifies a catalog. A missing file is an empty catalog. */
export async function loadCatalog(path: string): Promise<Catalog> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyCatalog();
    throw error;
  }
  return verifyCatalog(JSON.parse(text));
}

/** Writes a synced temporary file, then atomically replaces the catalog. */
export async function saveCatalog(
  path: string,
  catalog: Catalog,
): Promise<void> {
  const destination = resolve(path);
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(catalog, null, 2) + "\n", "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
  } catch (error) {
    // The previous catalog file is untouched; only remove the partial write.
    await rm(temporary, { force: true });
    throw error;
  }
  const directoryHandle = await open(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}
