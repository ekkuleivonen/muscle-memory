/**
 * Revision ids and catalog verification. Server and authoring only: hashing uses node:crypto,
 * which the app reaches through Next's Node runtime (nodejs_compat on Cloudflare).
 */
import { createHash } from "node:crypto";
import { canonical, type Json } from "../domain/json";
import type { Catalog, Revision } from "./model";
import { validateCatalog } from "./validate";

/** sha256:<hex> of the revision's canonical JSON: the same content always has the same id. */
export function revisionId(revision: Revision): string {
  return (
    "sha256:" +
    createHash("sha256")
      .update(canonical(revision as unknown as Json))
      .digest("hex")
  );
}

/**
 * Checks a catalog's structure and that every revision is stored under its own content hash,
 * so altered content fails loudly instead of being served.
 */
export function verifyCatalog(value: unknown): Catalog {
  const catalog = validateCatalog(value);
  for (const [id, revision] of Object.entries(catalog.revisions))
    if (revisionId(revision) !== id)
      throw new Error(`Revision ${id} does not match its content.`);
  return catalog;
}
