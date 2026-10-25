import { editableFiles, type Revision } from "../../../packages/content/model";

/** A historical bundle is never made one-file by silently dropping a required source or note. */
export function supportsOneFilePractice(revision: Revision): boolean {
  const paths = Object.keys(editableFiles(revision.workspace));
  return (
    paths.length === 1 &&
    paths[0] === revision.workspace.entry &&
    revision.hints.length === 0 &&
    !revision.ciFindings &&
    revision.team.every(
      (rule) => rule.where === "review" && rule.severity === "blocking",
    )
  );
}

/** Paths left intact in history, but not restorable into this one-file revision. */
export function incompatibleSavedPaths(
  revision: Revision,
  saved: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(saved).filter((path) => path !== revision.workspace.entry);
}
