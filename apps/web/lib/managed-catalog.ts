import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AuthoringService } from "../../../packages/authoring/service";
import {
  CatalogStorage,
  AuthoringUnavailable,
  type CatalogDatabase,
  type ContentBucket,
} from "../../../packages/authoring/storage";

interface ManagedEnv {
  CATALOG_DB?: CatalogDatabase;
  CONTENT?: ContentBucket;
}
export async function authoringService(): Promise<AuthoringService | null> {
  const mode = process.env.CATALOG_MODE;
  if (!mode || mode === "bundled") return null;
  if (mode !== "managed")
    throw new AuthoringUnavailable("Unknown catalog mode.");
  const env = (await getCloudflareContext({ async: true }))
    .env as unknown as ManagedEnv;
  if (!env.CATALOG_DB || !env.CONTENT)
    throw new AuthoringUnavailable(
      "Managed content storage is not configured.",
    );
  return new AuthoringService(new CatalogStorage(env.CATALOG_DB, env.CONTENT));
}
/** Null/undefined mean deliberately unconfigured; configured failures never fall back. */
export async function readManagedCatalog() {
  return (await authoringService())?.publicCatalog() ?? null;
}
export async function readManagedRevision(key: string, revision?: string) {
  const service = await authoringService();
  return service ? service.publicRevision(key, revision) : undefined;
}
