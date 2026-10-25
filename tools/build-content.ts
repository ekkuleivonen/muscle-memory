/**
 * Builds content/catalog.json from content/seed.ts: each issue's repo is generated here, at
 * authoring time, and each revision is stored under the SHA-256 of its content. Revisions
 * already in the catalog are kept (they are immutable and recorded work may name them), so
 * editing a seed issue adds a revision and moves the issue's live pointer to it. An issue with a
 * private part must pass the publish checks that need no code to run (packages/content/publish);
 * the private part itself is never written out.
 *
 *   node --import tsx tools/build-content.ts           write the catalog
 *   node --import tsx tools/build-content.ts --check   fail if it is out of date
 *   node --import tsx tools/build-content.ts --prune   drop revisions no issue points at
 *   node --import tsx tools/build-content.ts --dry-run run every check, write nothing
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoFor } from "../apps/web/lib/repo";
import type { LanguageId } from "../apps/web/lib/languages";
import type { Json } from "../packages/domain/json";
import {
  ESTIMATES,
  type Catalog,
  type IssueMetadata,
  type Persona,
  type Revision,
  type TeamComment,
} from "../packages/content/model";
import { continuityProblems, publishProblems } from "../packages/content/publish";
import { revisionId, verifyCatalog } from "../packages/content/revision";
import { SEED_ISSUES, SEED_PROJECTS, type SeedIssue } from "../content/seed";

const destination = resolve("content/catalog.json");
const check = process.argv.includes("--check");
const prune = process.argv.includes("--prune");
const dryRun = process.argv.includes("--dry-run");

/** Minutes of active work without progress before each hint level. */
const HINT_MINUTES = 10;

function revisionOf(seed: SeedIssue, key: string, project: (typeof SEED_PROJECTS)[number]): Revision {
  const cases = seed.inputs.map((input, index) => ({
    id: `case-${index + 1}`,
    // Only named cases carry a name, so unnamed issues keep their revision ids.
    ...(seed.names?.[index] ? { name: seed.names[index] } : {}),
    input: input as Json,
    expected: seed.expected[index] as Json,
    // Cases listed in `hidden` are left out of the repo's test file and only run in CI.
    visible: !seed.hidden?.includes(index),
  }));
  if (seed.entry && !["javascript", "typescript", "python"].includes(seed.language))
    throw new Error(`${seed.id}: only JavaScript, TypeScript and Python issues can place their entry file.`);
  const repo = repoFor({
    key,
    slug: seed.id,
    language: seed.language as LanguageId,
    entrypoint: seed.entrypoint,
    starter: seed.starter,
    task: seed.task,
    parameters: seed.parameters,
    schema: seed.schema,
    adapter: seed.adapter,
    criteria: cases.filter((c) => c.visible),
    project: { slug: project.key.toLowerCase(), title: project.title, story: project.story },
    hidden: cases.filter((c) => !c.visible).length,
    entry: seed.entry,
    files: seed.files?.map((f) => ({ ...f, language: f.language as LanguageId })),
  });
  const persona = (c: { author: string; role: string }): Persona => ({
    name: c.author,
    role: c.role,
  });
  const lead: Persona = seed.comments[0]
    ? persona(seed.comments[0])
    : { name: "Lena M", role: "Product" };
  return {
    issue: seed.id,
    kind: seed.kind,
    body: seed.task,
    skills: seed.skills,
    format: "code-change",
    workspace: {
      language: seed.language,
      files: Object.fromEntries(
        repo.files.map((f) => [f.path, { role: f.role, language: f.language, text: f.text }]),
      ),
      entry: repo.solution.path,
      entrypoint: seed.entrypoint,
      ...(seed.parameters ? { parameters: seed.parameters } : {}),
      ...(seed.schema ? { schema: seed.schema } : {}),
      ...(seed.adapter ? { adapter: seed.adapter } : {}),
    },
    checks: { cases },
    team: [
      // The ticket's own thread: there when the issue is opened.
      ...seed.comments.map(
        (comment, index): TeamComment => ({
          id: `${comment.author.split(" ")[0].toLowerCase()}-${index + 1}`,
          author: persona(comment),
          where: "issue",
          severity: "info",
          text: [comment.body],
          when: { event: "opened" },
        }),
      ),
      ...(seed.team ?? []).map(
        ({ author, role, ...comment }): TeamComment => ({
          ...comment,
          author: { name: author, role },
        }),
      ),
    ],
    ...(seed.ciFindings ? { ciFindings: seed.ciFindings } : {}),
    hints: seed.hints.map((hint, index) => ({
      id: `hint-${index + 1}`,
      level: index + 1,
      author: lead,
      ...(typeof hint === "string"
        ? {
            text: hint,
            when: {
              behaviour: "active-minutes-without-progress" as const,
              atLeast: HINT_MINUTES * (index + 1),
            },
          }
        : hint),
    })),
    // Drafted with a model while designing the tracker; not yet reviewed issue by issue.
    authored: { by: "ai-drafted", reviewers: [] },
  };
}

// Only earlier revisions are kept from the old catalog, so only they are verified: its live
// metadata (difficulty, labels, state) is rebuilt from the seed and may predate today's rules.
const previous = await readFile(destination, "utf8").then(
  (text) => {
    const old = JSON.parse(text) as Partial<Catalog>;
    return verifyCatalog({ ...old, projects: [], issues: [] });
  },
  () => null,
);
const seeds = new Map(SEED_ISSUES.map((s) => [s.id, s]));
const revisions: Record<string, Revision> = prune ? {} : { ...previous?.revisions };
const issues: IssueMetadata[] = [];
// Every issue's problems, so one run lists them all.
const blocked: string[] = [];
for (const project of SEED_PROJECTS)
  project.issues.forEach((id, index) => {
    const seed = seeds.get(id);
    if (!seed) throw new Error(`${project.id} lists unknown issue ${id}.`);
    const number = index + 1;
    const revision = revisionOf(seed, `${project.key}-${number}`, project);
    if (seed.private) {
      const problems = publishProblems(revision, seed.private);
      if (problems.length)
        blocked.push(`${seed.id} cannot be published:\n  ${problems.join("\n  ")}`);
    }
    // Work in progress restores onto the new revision by path; never strand it.
    const live = previous?.issues.find((i) => i.id === id)?.revision;
    const before = live ? previous?.revisions[live] : undefined;
    const stranded = before ? continuityProblems(before, revision) : [];
    if (stranded.length)
      blocked.push(`${seed.id} would lose saved work:\n  ${stranded.join("\n  ")}`);
    const rid = revisionId(revision);
    revisions[rid] = revision;
    issues.push({
      id,
      project: project.id,
      number,
      title: seed.title,
      summary: seed.summary,
      difficulty: seed.difficulty,
      estimate: ESTIMATES[seed.difficulty],
      labels: seed.skills,
      state: "live",
      revision: rid,
    });
  });
if (blocked.length) throw new Error(blocked.join("\n"));
for (const id of seeds.keys())
  if (!issues.some((i) => i.id === id)) throw new Error(`${id} is in no project.`);

const catalog: Catalog = verifyCatalog({
  schemaVersion: "2.0.0",
  projects: SEED_PROJECTS.map(({ id, key, title, summary, story, issues, listed }) => ({
    id,
    key,
    title,
    summary,
    story,
    issues,
    listed: listed ?? true,
  })),
  issues,
  // Sorted, so the file only changes where content does.
  revisions: Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b))),
});
const text = JSON.stringify(catalog, null, 2) + "\n";
if (check) {
  if ((await readFile(destination, "utf8").catch(() => "")) !== text)
    throw new Error("content/catalog.json is out of date. Run npm run build:content.");
  console.log("Content catalog is current.");
} else if (dryRun) {
  console.log(`Checked ${issues.length} issues; nothing written.`);
} else {
  await writeFile(destination, text);
  console.log(
    `Wrote ${issues.length} issues, ${Object.keys(catalog.revisions).length} revisions.`,
  );
}
