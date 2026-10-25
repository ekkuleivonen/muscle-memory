/**
 * Publish checks that need code to run, in the browser sandbox like every run: for each live
 * issue with a private reference solution, the reference passes every case and gives the same
 * outputs on a second run, and the starter fails at least one case. Issues without a reference
 * are listed as unchecked. The checks that need no code to run happen in the content build.
 *
 *   node --import tsx tools/browser/content-check.ts
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { SEED_ISSUES } from "../../content/seed";
import { editableFiles, executableOf, sourceFiles, type Revision } from "../../packages/content/model";
import { verifyCatalog } from "../../packages/content/revision";
import { runFeedback } from "../../packages/domain/workspace";

const root = resolve(import.meta.dirname, "../..");
const catalog = verifyCatalog(
  JSON.parse(await readFile(join(root, "content/catalog.json"), "utf8")),
);
const bundle = (
  await build({
    entryPoints: [join(root, "packages/runner/runner.ts")],
    bundle: true,
    format: "iife",
    globalName: "MMRunner",
    write: false,
    target: "es2022",
  })
).outputFiles[0].text;
const page = `<!doctype html><meta charset="utf-8"><body><div id="host"></div>
<script src="/runner.js"></script>`;

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://x").pathname;
  if (path === "/") return response.writeHead(200, { "content-type": "text/html" }).end(page);
  if (path === "/runner.js")
    return response.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
  try {
    const bytes = await readFile(join(root, "apps/web/public", path));
    const type = path.endsWith(".wasm")
      ? "application/wasm"
      : path.endsWith(".mjs") || path.endsWith(".js")
        ? "text/javascript"
        : "application/octet-stream";
    response.writeHead(200, { "content-type": type }).end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

/** A run request as the IDE makes it: the entry file, plus every other source file. */
function request(revision: Revision, edits: Record<string, string>) {
  const executable = executableOf(revision);
  const program = {
    ...Object.fromEntries(
      Object.entries(sourceFiles(revision.workspace)).map(([path, f]) => [path, f.text]),
    ),
    ...edits,
  };
  const { entry } = executable;
  return {
    runId: "publish",
    code: program[entry],
    filename: entry,
    files: Object.fromEntries(Object.entries(program).filter(([path]) => path !== entry)),
    language: revision.workspace.language,
    entrypoint: executable.entrypoint,
    ...(executable.parameters ? { parameters: executable.parameters } : {}),
    ...(executable.schema ? { setup: executable.schema } : {}),
    ...(executable.adapter ? { adapter: executable.adapter } : {}),
    inputs: executable.cases.map((c) => c.input),
  };
}

const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(origin + "/");
const failures: string[] = [];
const unchecked: string[] = [];
for (const meta of catalog.issues) {
  const revision = catalog.revisions[meta.revision];
  const secret = SEED_ISSUES.find((s) => s.id === meta.id)?.private;
  const project = catalog.projects.find((p) => p.id === meta.project)!;
  const key = `${project.key}-${meta.number}`;
  if (!secret) {
    unchecked.push(key);
    continue;
  }
  const starter = Object.fromEntries(
    Object.entries(editableFiles(revision.workspace)).map(([path, f]) => [path, f.text]),
  );
  const runs = await tab.evaluate(
    async ({ requests }) => {
      const outcomes = [];
      for (const req of requests) {
        const runner = new (window as any).MMRunner.Runner(
          (window as any).MMRunner.engineFor(req.language),
          document.getElementById("host"),
          { timeoutMs: 30000 },
        );
        try {
          outcomes.push(await runner.run(req));
        } finally {
          runner.dispose();
        }
      }
      return outcomes;
    },
    {
      requests: [
        request(revision, secret.reference),
        request(revision, secret.reference),
        request(revision, starter),
        ...(secret.alternatives ?? []).map((change) => request(revision, change)),
        ...(secret.wrong ?? []).map((change) => request(revision, change)),
      ],
    },
  );
  const [first, second, start, ...others] = runs.map((outcome: any) => ({
    outcome,
    feedback: runFeedback(revision.checks.cases, outcome.cases ?? []),
  }));
  const alternatives = others.slice(0, secret.alternatives?.length ?? 0);
  const wrong = others.slice(alternatives.length);
  const problems: string[] = [];
  if (first.outcome.phase !== "tests" || first.feedback.correct !== first.feedback.total)
    problems.push(
      `the reference passes ${first.feedback.correct}/${first.feedback.total} cases (${first.outcome.status}${first.outcome.error ? `: ${first.outcome.error.message}` : ""})`,
    );
  const outputs = (o: any) => JSON.stringify((o.cases ?? []).map((c: any) => c.output?.text ?? c.error));
  if (outputs(first.outcome) !== outputs(second.outcome))
    problems.push("the reference gives different outputs on a second run");
  if (start.outcome.phase === "tests" && start.feedback.correct === start.feedback.total)
    problems.push("the starter already passes every case");
  // Other correct designs must pass everything; plausible wrong fixes must fail something.
  alternatives.forEach((run, i) => {
    if (run.outcome.phase !== "tests" || run.feedback.correct !== run.feedback.total)
      problems.push(`alternative ${i + 1} passes ${run.feedback.correct}/${run.feedback.total} cases`);
  });
  wrong.forEach((run, i) => {
    if (run.outcome.phase === "tests" && run.feedback.correct === run.feedback.total)
      problems.push(`wrong fix ${i + 1} passes every case`);
  });
  if (problems.length) failures.push(`FAIL ${key} ${meta.id}: ${problems.join("; ")}`);
  else
    console.log(
      `ok   ${key} ${meta.id}: reference ${first.feedback.correct}/${first.feedback.total} twice, starter ${start.feedback.correct}/${start.feedback.total}${
        alternatives.length || wrong.length
          ? `, ${alternatives.length} alternative${alternatives.length === 1 ? "" : "s"} pass, ${wrong.length} wrong fix${wrong.length === 1 ? "" : "es"} fail (${wrong.map((w) => `${w.feedback.correct}/${w.feedback.total}`).join(", ")})`
          : ""
      }`,
    );
}
await browser.close();
server.close();
for (const failure of failures) console.log(failure);
console.log(`unchecked (no reference yet): ${unchecked.join(", ") || "none"}`);
process.exit(failures.length ? 1 : 0);
