/**
 * Read-only audit for the single-file direction (ENG-329): for each published issue's live
 * revision, which files a solution must change (from its private reference solution, the same one
 * `npm run check:publish` runs), which files are support or tests, and which requirements live
 * outside the description (teammate comments, hints). Prints JSON; changes nothing.
 *
 *   node --import tsx tools/audit/single-file.ts > audit.json
 */
import { readFileSync } from "node:fs";
import { SEED_ISSUES } from "../../content/seed";
import { verifyCatalog } from "../../packages/content/revision";

const catalog = verifyCatalog(
  JSON.parse(
    readFileSync(
      new URL("../../content/catalog.json", import.meta.url),
      "utf8",
    ),
  ),
);

const rows = catalog.issues.map((meta) => {
  const revision = catalog.revisions[meta.revision];
  const project = catalog.projects.find((p) => p.id === meta.project)!;
  const { files, entry, language } = revision.workspace;
  const byRole = (role: string) =>
    Object.entries(files)
      .filter(([, f]) => f.role === role)
      .map(([path]) => path);
  const edit = byRole("edit");
  const reference =
    SEED_ISSUES.find((s) => s.id === meta.id)?.private?.reference ?? null;
  // Files the reference solution changes from their starting text.
  const changed = reference
    ? Object.entries(reference)
        .filter(([path, text]) => files[path]?.text !== text)
        .map(([path]) => path)
    : null;
  const others = Object.keys(files).filter((p) => p !== entry);
  const blocking = revision.team.filter((c) => c.severity === "blocking");
  return {
    key: `${project.key}-${meta.number}`,
    id: meta.id,
    language,
    entry,
    editable: edit,
    roles: Object.fromEntries(
      Object.entries(files).map(([p, f]) => [p, f.role]),
    ),
    referenceChanges: changed,
    multiFileSolution: changed ? changed.some((p) => p !== entry) : null,
    bodyNamesOtherFiles: others.filter((p) => revision.body.includes(p)),
    cases: revision.checks.cases.length,
    hidden: revision.checks.cases.filter((c) => !c.visible).length,
    hiddenNamed: revision.checks.cases.filter((c) => !c.visible && c.name)
      .length,
    hints: revision.hints.length,
    team: revision.team.map((c) => ({
      id: c.id,
      where: c.where,
      severity: c.severity,
      repeat: c.repeat ?? "once",
      explicit: c.resolve === "explicit",
    })),
    blockingRules: blocking.map((c) => c.id),
    ciFindings: revision.ciFindings ?? null,
    schema: !!revision.workspace.schema,
    adapter: !!revision.workspace.adapter,
  };
});
console.log(JSON.stringify(rows, null, 2));
