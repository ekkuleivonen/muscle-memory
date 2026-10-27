/** Read-only export from the existing managed catalog; never logs material or stores credentials. */
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogCopyPath,
  validateCopy,
  type CatalogCopy,
} from "../packages/content/copy";
import { revisionId } from "../packages/content/revision";
import type { ChallengeSource } from "../packages/content/source";
import type { Revision } from "../packages/content/model";
import type { Head, Version } from "../packages/authoring/storage";

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const destination = catalogCopyPath(root);
  if (!destination.startsWith(resolve(root, ".local") + "/"))
    throw new Error("Use a gitignored .local destination.");
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token && !process.env.CI) {
    const conf = await readFile(
      resolve(homedir(), "Library/Preferences/.wrangler/config/default.toml"),
      "utf8",
    );
    const match = conf.match(/^oauth_token\s*=\s*("[^"\n]+")/m);
    if (match) token = JSON.parse(match[1]);
  }
  if (!token)
    throw new Error("Existing authorized catalog read access is required.");
  const api =
    "https://api.cloudflare.com/client/v4/accounts/166fd3dff06a9c3f1aef172a25db7ace";
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(api + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw new Error(`Catalog read HTTP ${r.status}. No permissions changed.`);
    return r;
  };
  const query = async <T>(sql: string) => {
    const body = (await (
      await call("/d1/database/30916af3-46a7-451c-b0d3-92570e090329/query", {
        method: "POST",
        body: JSON.stringify({ sql }),
      })
    ).json()) as any;
    if (body.success !== true || body.result?.[0]?.success !== true)
      throw new Error("Catalog metadata read failed.");
    return body.result[0].results as T[];
  };
  const state = async () =>
    (
      await query<{ generation: number; active_object: string }>(
        "SELECT generation,active_object FROM catalog_state WHERE singleton=1",
      )
    )[0];
  const before = await state();
  const object = async (key: string) =>
    JSON.parse(
      await (
        await call(
          `/r2/buckets/muscle-memory-content/objects/${encodeURIComponent(key)}`,
        )
      ).text(),
    );
  const catalog = await object(before.active_object);
  const versions = await query<Version>(
    "SELECT * FROM published_versions ORDER BY revision",
  );
  const heads = await query<Head>(
    "SELECT * FROM challenge_heads ORDER BY challenge_key",
  );
  const archives: Record<string, Revision> = {};
  for (const v of versions) archives[v.revision] = await object(v.object_key);
  const sources: ChallengeSource[] = [];
  for (const meta of catalog.challenges) {
    const head = heads.find((h) => h.challenge_key === meta.key);
    if (!head?.draft_object)
      throw new Error("Published private source is missing.");
    let source = (await object(head.draft_object)) as ChallengeSource;
    if (revisionId(source.revision) !== meta.revision) {
      // A newer draft can coexist with a published version. Search immutable private draft
      // copies, never substitute the newer draft's QA for the published challenge.
      let cursor = "",
        found: ChallengeSource | undefined;
      do {
        const qs = new URLSearchParams({
          prefix: `private/drafts/${meta.key}/`,
          per_page: "1000",
          ...(cursor ? { cursor } : {}),
        });
        const page = (await (
          await call(`/r2/buckets/muscle-memory-content/objects?${qs}`)
        ).json()) as any;
        if (page.success !== true || !Array.isArray(page.result))
          throw new Error("Private source listing failed.");
        for (const item of page.result) {
          const candidate = (await object(item.key)) as ChallengeSource;
          if (revisionId(candidate.revision) === meta.revision) {
            found = candidate;
            break;
          }
        }
        const next = page.result_info?.is_truncated
          ? page.result_info.cursor
          : "";
        if (next && next === cursor) throw new Error("Invalid catalog cursor.");
        cursor = next;
      } while (cursor && !found);
      if (!found)
        throw new Error("Exact published private source is unavailable.");
      source = found;
    }
    sources.push(source);
  }
  if (JSON.stringify(await state()) !== JSON.stringify(before))
    throw new Error(
      "Catalog changed during export; retry after the edit finishes.",
    );
  const copy: CatalogCopy = validateCopy({
    schemaVersion: "managed-catalog-copy-1",
    exportedAt: new Date().toISOString(),
    catalog,
    archives,
    sources,
  });
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = destination + ".tmp";
  await writeFile(temporary, JSON.stringify(copy), { mode: 0o600 });
  await rename(temporary, destination);
  console.log(
    `Private managed copy verified: ${sources.length} published challenges, ${versions.length} revisions. No material printed or cloud writes performed.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error && /^Catalog read HTTP \d+\./.test(error.message)
      ? error.message
      : "Catalog export failed; existing copy preserved. Check authorized read access and managed catalog consistency locally.",
  );
  process.exitCode = 1;
});
