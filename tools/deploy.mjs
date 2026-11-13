/**
 * Production deploy from the operator's Mac (docs/cloudflare-build.md#deploying).
 *
 * Cloudflare credentials come from Infisical company-platform/prod/cloudflare, the account's one
 * central token, and live only in this process and the wrangler/npm children it starts: never in
 * argv, a file, .dev.vars or GitHub secrets. Without INFISICAL_TOKEN the script re-runs itself
 * under homelab's operator loader (`scripts/operator_env.py --token-only`), which logs in with
 * the Infisical bootstrap and revokes the token when the deploy exits.
 *
 *   npm run deploy               # catalog pull, tests, typecheck, build, deploy ingest then app
 *   npm run deploy -- --dry-run  # the same, with `wrangler deploy --dry-run` (uploads nothing)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOMELAB = process.env.HOMELAB_CHECKOUT ?? join(homedir(), "homelab");
const INFISICAL = {
  domain: "https://app.infisical.com/api",
  project: "f6b23894-0ac9-4fae-b5a9-deea8781504f",
  environment: "prod",
  path: "/cloudflare",
};
const dryRun = process.argv.includes("--dry-run");
const unknown = process.argv.slice(2).filter((a) => a !== "--dry-run");
if (unknown.length) throw Error(`Unknown arguments: ${unknown.join(" ")}`);

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`Stopped: ${command} ${args[0] ?? ""} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

if (!process.env.INFISICAL_TOKEN) {
  const loader = join(HOMELAB, "scripts/operator_env.py");
  if (!existsSync(loader))
    throw Error(`Set HOMELAB_CHECKOUT to a homelab checkout (no ${loader}).`);
  const args = ["run", "--project", HOMELAB, "--locked", "python", loader, "--token-only"];
  run("uv", [...args, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], process.env);
  process.exit(0);
}

if (!dryRun) {
  // Production is main: deploy only a clean checkout of the commit origin/main points at.
  git("fetch", "--quiet", "origin", "main");
  if (git("status", "--porcelain")) throw Error("Uncommitted changes: deploy a clean checkout.");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main"))
    throw Error("HEAD is not origin/main: production deploys only main.");
}

// Read the folder in memory. The CLI gets the token through its environment, not argv.
const exported = execFileSync(
  "infisical",
  [
    "export",
    "--silent",
    `--domain=${INFISICAL.domain}`,
    `--projectId=${INFISICAL.project}`,
    `--env=${INFISICAL.environment}`,
    `--path=${INFISICAL.path}`,
    "--format=json",
  ],
  { env: process.env, stdio: ["ignore", "pipe", "ignore"] },
);
const values = Object.fromEntries(JSON.parse(exported).map((e) => [e.key, e.value]));
for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"])
  if (!values[name]) throw Error(`Infisical ${INFISICAL.path} has no ${name}.`);

const env = { ...process.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
delete env.INFISICAL_TOKEN; // the children need Cloudflare, not Infisical
env.CLOUDFLARE_API_TOKEN = values.CLOUDFLARE_API_TOKEN;
env.CLOUDFLARE_ACCOUNT_ID = values.CLOUDFLARE_ACCOUNT_ID;
delete env.CATALOG_READ_TOKEN; // tools/pull-catalog.ts falls back to CLOUDFLARE_API_TOKEN locally

const sha = git("rev-parse", "--short=7", "HEAD");
const dry = (name) => (dryRun ? ["--dry-run", "--outdir", `.local/deploy-dry-run/${name}`] : []);
run("npm", ["run", "catalog:pull"], env);
for (const check of ["test", "typecheck", "build:cloudflare"])
  run(process.execPath, ["tools/private-check.mjs", check], env);
// The ingest Worker first, so it accepts what the new app records (as CI did).
run("npx", ["wrangler", "deploy", "--config", "apps/ingest/wrangler.jsonc", "--env=", ...dry("ingest")], env);
run(
  "npx",
  ["wrangler", "deploy", "--config", "apps/web/wrangler.jsonc", "--message", `main ${sha}, local deploy`, ...dry("web")],
  env,
);
console.log(dryRun ? "Dry run passed; nothing was uploaded." : `Deployed ${sha}.`);
