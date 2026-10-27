/**
 * Publish checks that need code to run, in the browser sandbox like every run: for each
 * challenge in content/challenges, the solution passes every case and gives the same outputs on
 * a second run, the starter fails at least one case, every alternative passes and every wrong
 * solution fails something. The checks that need no code to run happen in the content build.
 *
 *   node --import tsx tools/browser/content-check.ts           every challenge
 *   node --import tsx tools/browser/content-check.ts PY-002 GO-005   only these
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { Revision } from "../../packages/content/model";
import { readChallenges } from "../../packages/content/source";
import { runFeedback } from "../../packages/domain/records";

const root = resolve(import.meta.dirname, "../..");
const only = process.argv.slice(2);
const challenges = readChallenges().filter(
  (c) => !only.length || only.includes(c.metadata.key),
);
if (only.length && challenges.length !== only.length)
  throw new Error(`unknown challenge key among ${only.join(", ")}`);
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

/** A run request as practice makes it: the file, with the challenge's cases. */
function request(revision: Revision, code: string) {
  return {
    runId: "publish",
    code,
    filename: revision.file,
    files: {},
    language: revision.language,
    entrypoint: revision.entrypoint,
    ...(revision.parameters ? { parameters: revision.parameters } : {}),
    ...(revision.schema ? { setup: revision.schema } : {}),
    ...(revision.adapter ? { adapter: revision.adapter } : {}),
    inputs: revision.cases.map((c) => c.input),
  };
}

const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(origin + "/");
const failures: string[] = [];
for (const { metadata, revision, private: secret } of challenges) {
  const { key } = metadata;
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
        request(revision, secret.solution),
        request(revision, secret.solution),
        request(revision, revision.starter),
        ...secret.alternatives.map((code) => request(revision, code)),
        ...secret.wrong.map((code) => request(revision, code)),
      ],
    },
  );
  const [first, second, start, ...others] = runs.map((outcome: any) => ({
    outcome,
    feedback: runFeedback(revision.cases, outcome.cases ?? []),
  }));
  const alternatives = others.slice(0, secret.alternatives.length);
  const wrong = others.slice(alternatives.length);
  const problems: string[] = [];
  if (first.outcome.phase !== "tests" || first.feedback.correct !== first.feedback.total)
    problems.push(
      `the solution passes ${first.feedback.correct}/${first.feedback.total} cases (${first.outcome.status}${first.outcome.error ? `: ${first.outcome.error.message}` : ""})`,
    );
  const outputs = (o: any) => JSON.stringify((o.cases ?? []).map((c: any) => c.output?.text ?? c.error));
  if (outputs(first.outcome) !== outputs(second.outcome))
    problems.push("the solution gives different outputs on a second run");
  if (start.outcome.phase === "tests" && start.feedback.correct === start.feedback.total)
    problems.push("the starter already passes every case");
  // Other correct designs must pass everything; plausible wrong solutions must fail something.
  alternatives.forEach((run, i) => {
    if (run.outcome.phase !== "tests" || run.feedback.correct !== run.feedback.total)
      problems.push(`alternative ${i + 1} passes ${run.feedback.correct}/${run.feedback.total} cases`);
  });
  wrong.forEach((run, i) => {
    if (run.outcome.phase === "tests" && run.feedback.correct === run.feedback.total)
      problems.push(`wrong solution ${i + 1} passes every case`);
  });
  if (problems.length) failures.push(`FAIL ${key}: ${problems.join("; ")}`);
  else
    console.log(
      `ok   ${key}: solution ${first.feedback.correct}/${first.feedback.total} twice, starter ${start.feedback.correct}/${start.feedback.total}${
        alternatives.length || wrong.length
          ? `, ${alternatives.length} alternative${alternatives.length === 1 ? "" : "s"} pass, ${wrong.length} wrong solution${wrong.length === 1 ? "" : "s"} fail (${wrong.map((w) => `${w.feedback.correct}/${w.feedback.total}`).join(", ")})`
          : ""
      }`,
    );
}
await browser.close();
server.close();
for (const failure of failures) console.log(failure);
process.exit(failures.length ? 1 : 0);
