/**
 * Builds content/catalog.json from content/seed.ts: each issue's repo is generated here, at
 * authoring time, and each revision is stored under the SHA-256 of its content. Revisions
 * already in the catalog are kept (they are immutable and recorded work may name them), so
 * editing a seed issue adds a revision and moves the issue's live pointer to it.
 *
 *   node --import tsx tools/build-content.ts           write the catalog
 *   node --import tsx tools/build-content.ts --check   fail if it is out of date
 *   node --import tsx tools/build-content.ts --prune   drop revisions no issue points at
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
import { revisionId, verifyCatalog } from "../packages/content/revision";
import { SEED_ISSUES, SEED_PROJECTS, type SeedIssue } from "../content/seed";

const destination = resolve("content/catalog.json");
const check = process.argv.includes("--check");
const prune = process.argv.includes("--prune");

/** Minutes of active work without progress before each hint level. */
const HINT_MINUTES = 10;

function revisionOf(seed: SeedIssue, key: string, project: (typeof SEED_PROJECTS)[number]): Revision {
  const cases = seed.inputs.map((input, index) => ({
    id: `case-${index + 1}`,
    input: input as Json,
    expected: seed.expected[index] as Json,
    visible: true,
  }));
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

const previous = await readFile(destination, "utf8").then(
  (text) => verifyCatalog(JSON.parse(text)),
  () => null,
);
const seeds = new Map(SEED_ISSUES.map((s) => [s.id, s]));
const revisions: Record<string, Revision> = prune ? {} : { ...previous?.revisions };
const issues: IssueMetadata[] = [];
for (const project of SEED_PROJECTS)
  project.issues.forEach((id, index) => {
    const seed = seeds.get(id);
    if (!seed) throw new Error(`${project.id} lists unknown issue ${id}.`);
    const number = index + 1;
    const revision = revisionOf(seed, `${project.key}-${number}`, project);
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
for (const id of seeds.keys())
  if (!issues.some((i) => i.id === id)) throw new Error(`${id} is in no project.`);

const catalog: Catalog = verifyCatalog({
  schemaVersion: "2.0.0",
  projects: SEED_PROJECTS.map(({ id, key, title, summary, story, issues }) => ({
    id,
    key,
    title,
    summary,
    story,
    issues,
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
} else {
  await writeFile(destination, text);
  console.log(
    `Wrote ${issues.length} issues, ${Object.keys(catalog.revisions).length} revisions.`,
  );
}
