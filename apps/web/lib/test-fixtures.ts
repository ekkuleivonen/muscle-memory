/** The real catalog, for tests: verified like the app verifies it. */
import { readFileSync } from "node:fs";
import {
  editableFiles,
  executableOf,
  type Revision,
} from "../../../packages/content/model";
import { verifyCatalog } from "../../../packages/content/revision";

export const catalog = verifyCatalog(
  JSON.parse(
    readFileSync(new URL("../../../content/catalog.json", import.meta.url), "utf8"),
  ),
);

/** An issue's live revision, with what a workspace session needs from it. */
export function live(issue: string): {
  id: string;
  revision: Revision;
  executable: ReturnType<typeof executableOf>;
  /** The entry file's path and starting text. */
  path: string;
  starter: string;
} {
  const meta = catalog.issues.find((i) => i.id === issue);
  if (!meta) throw new Error(`No issue ${issue} in the catalog.`);
  const revision = catalog.revisions[meta.revision];
  return {
    id: meta.revision,
    revision,
    executable: executableOf(revision),
    path: revision.workspace.entry,
    starter: editableFiles(revision.workspace)[revision.workspace.entry].text,
  };
}

/**
 * An issue's revision as it was live just before the single-file normalization (ENG-329): with
 * hints, a ticket thread, nits and explicit Resolve. Those revisions stay published, because
 * recorded work names them, so what they release is still tested on them.
 */
export function historical(issue: string): ReturnType<typeof live> {
  const ids = JSON.parse(
    readFileSync(
      new URL("./pre-single-file-revisions.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
  const revision = catalog.revisions[ids[issue]];
  if (!revision)
    throw new Error(`No earlier revision of ${issue} in the catalog.`);
  return {
    id: ids[issue],
    revision,
    executable: executableOf(revision),
    path: revision.workspace.entry,
    starter: editableFiles(revision.workspace)[revision.workspace.entry].text,
  };
}
