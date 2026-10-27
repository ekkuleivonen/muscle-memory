/** Bootstrap existing published content. This imports history; it does not fabricate authoring QA. */
import type { Catalog, Revision } from "../content/model";
import type { ChallengeSource } from "../content/source";
import { revisionId, verifyCatalog } from "../content/revision";
import { canonical, type Json } from "../domain/json";
import { digest, runtimePin } from "./runtime";
import { normalizeStoredSource } from "../content/copy";
import {
  AuthoringConflict,
  CatalogStorage,
  type Statement,
  type Head,
  type Version,
} from "./storage";

export interface SeedInput {
  catalog: Catalog;
  archives: Readonly<Record<string, Revision>>;
  sources: readonly ChallengeSource[];
}
const text = (value: unknown) => canonical(value as Json);
export interface SeedPlan {
  catalogObject: string;
  objects: { key: string; text: string }[];
  heads: {
    key: string;
    revision: string;
    object: string | null;
    digest: string | null;
    lifecycle: "published" | "archived";
    metadata: string;
  }[];
  versions: {
    id: string;
    key: string;
    object: string;
    metadata: string;
    runtime: string;
  }[];
}

/** Validate the complete input before making any storage writes. */
export async function planCatalogSeed(input: SeedInput): Promise<SeedPlan> {
  const catalog = verifyCatalog(input.catalog);
  if (!catalog.challenges.length)
    throw new Error("Cannot seed an empty catalog.");
  const metadata = new Map(catalog.challenges.map((m) => [m.key, m]));
  const sources = new Map<string, ChallengeSource>();
  for (const source of input.sources) {
    const normalized = normalizeStoredSource(source);
    if (text(normalized) !== text(source))
      throw new Error("Seed source has unrecognized fields.");
    const key = source.metadata.key;
    if (sources.has(key) || !metadata.has(key))
      throw new Error(`Unexpected or duplicate seed source: ${key}`);
    const { revision, ...meta } = metadata.get(key)!;
    if (
      text(meta) !== text(source.metadata) ||
      revisionId(source.revision) !== revision
    )
      throw new Error(`Source does not match current catalog: ${key}`);
    sources.set(key, source);
  }
  if (sources.size !== metadata.size)
    throw new Error(
      "Every current challenge needs its original private source.",
    );
  // Archived challenges remain registered even when absent from discovery.
  for (const [id, revision] of Object.entries(input.archives)) {
    if (!metadata.has(revision.challenge) && revision.publication)
      metadata.set(revision.challenge, {
        ...revision.publication.metadata,
        revision: id,
      });
  }
  const objects: SeedPlan["objects"] = [];
  const versions: SeedPlan["versions"] = [];
  const runtime = new Map<string, string>();
  for (const [id, revision] of Object.entries(input.archives).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const meta = revision.publication
      ? { ...revision.publication.metadata, revision: id }
      : metadata.get(revision.challenge);
    if (!meta || revisionId(revision) !== id)
      throw new Error(`Invalid or unrecognized archive: ${id}`);
    // Validate historical content against current metadata context; past titles are not known.
    verifyCatalog({
      schemaVersion: "1.0.0",
      challenges: [{ ...meta, revision: id }],
      revisions: { [id]: revision },
    });
    const plain = revision;
    const projected = normalizeStoredSource({
      metadata: { ...meta, revision: undefined },
      revision: plain,
      private: sources.get(meta.key)?.private ?? {
        solution: "",
        alternatives: [],
        wrong: [],
        examples: {},
      },
    }).revision;
    if (text(projected) !== text(plain))
      throw new Error(`Archive contains unrecognized public fields: ${id}`);
    if (!runtime.has(revision.language))
      runtime.set(
        revision.language,
        (await runtimePin(revision.language)).fingerprint,
      );
    const key = `published/revisions/${id.slice(7)}.json`;
    objects.push({ key, text: text(revision) });
    versions.push({
      id,
      key: meta.key,
      object: key,
      metadata: text({ ...meta, revision: id }),
      runtime: runtime.get(revision.language)!,
    });
  }
  for (const meta of catalog.challenges)
    if (!input.archives[meta.revision])
      throw new Error(`Current revision missing from archive: ${meta.key}`);
  const heads: SeedPlan["heads"] = [];
  for (const [key, source] of [...sources].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const sourceDigest = await digest(source);
    const object = `private/drafts/${key}/${sourceDigest.slice(7)}.json`;
    objects.push({ key: object, text: text(source) });
    heads.push({
      key,
      lifecycle: "published",
      revision: metadata.get(key)!.revision,
      object,
      digest: sourceDigest,
      metadata: text({
        ...source.metadata,
        language: source.revision.language,
      }),
    });
  }
  for (const [key, meta] of metadata)
    if (!sources.has(key))
      heads.push({
        key,
        lifecycle: "archived",
        revision: meta.revision,
        object: null,
        digest: null,
        metadata: text({
          ...meta,
          language: input.archives[meta.revision].language,
        }),
      });
  const catalogObject = `published/catalogs/${(await digest(catalog)).slice(7)}.json`;
  objects.push({ key: catalogObject, text: text(catalog) });
  return { catalogObject, objects, heads, versions };
}

export type SeedResult =
  | {
      status: "seeded";
      challenges: number;
      revisions: number;
      catalogObject: string;
    }
  | { status: "already-initialized" };

export async function seedCatalog(
  storage: CatalogStorage,
  input: SeedInput,
  at = new Date().toISOString(),
): Promise<SeedResult> {
  const state = await storage.catalogState();
  if (state?.seeded_at) return { status: "already-initialized" };
  if (
    !state ||
    state.generation !== 0 ||
    state.active_object ||
    (
      await storage.db
        .prepare("SELECT COUNT(*) AS n FROM challenge_heads")
        .first<{ n: number }>()
    )?.n
  )
    throw new AuthoringConflict(
      "Catalog is not a fresh, migrated database. Nothing was initialized.",
    );
  const plan = await planCatalogSeed(input);
  for (const object of plan.objects)
    await storage.immutableObject(object.key, object.text);
  const sql = (query: string, ...values: unknown[]) =>
    storage.db.prepare(query).bind(...values);
  // A duplicate singleton aborts this batch if another operation initialized state first.
  // D1 executes the entire batch transactionally, including this precondition and audit.
  const statements: Statement[] = [
    sql(`INSERT INTO catalog_state(singleton) SELECT 1 WHERE
      EXISTS (SELECT 1 FROM catalog_state WHERE seeded_at IS NOT NULL OR generation <> 0 OR active_object IS NOT NULL)
      OR EXISTS (SELECT 1 FROM challenge_heads) OR EXISTS (SELECT 1 FROM published_versions)
      OR EXISTS (SELECT 1 FROM publication_intents)`),
    sql(
      `INSERT INTO operator_audit(audit_id,request_id,action,challenge_key,revision,occurred_at,result)
      VALUES ('catalog.seed','catalog.seed','catalog.seed','*',NULL,?,'succeeded')`,
      at,
    ),
    ...plan.heads.map((h) =>
      sql(
        `INSERT INTO challenge_heads
      (challenge_key,generation,lifecycle,published_revision,draft_object,draft_digest,draft_metadata,qa_receipt,updated_at)
      VALUES (?,1,?,?,?,?,?,NULL,?)`,
        h.key,
        h.lifecycle,
        h.revision,
        h.object,
        h.digest,
        h.metadata,
        at,
      ),
    ),
    ...plan.versions.map((v) =>
      sql(
        `INSERT INTO published_versions
      (revision,challenge_key,object_key,metadata_json,runtime_fingerprint,published_at) VALUES (?,?,?,?,?,?)`,
        v.id,
        v.key,
        v.object,
        v.metadata,
        v.runtime,
        at,
      ),
    ),
    ...plan.heads
      .filter((h) => h.lifecycle === "published")
      .map((h) =>
        sql(
          `INSERT INTO publication_intents(revision,challenge_key,state,created_at)
      VALUES (?,?,'blocked_configuration',?)`,
          h.revision,
          h.key,
          at,
        ),
      ),
    sql(
      `UPDATE catalog_state SET generation=1,active_object=?,seeded_at=? WHERE singleton=1`,
      plan.catalogObject,
      at,
    ),
  ];
  try {
    await storage.db.batch(statements);
  } catch (error) {
    if ((await storage.catalogState())?.seeded_at)
      return { status: "already-initialized" };
    throw error;
  }
  return {
    status: "seeded",
    challenges: plan.heads.length,
    revisions: plan.versions.length,
    catalogObject: plan.catalogObject,
  };
}

/** Verify local restored history; an archived head may intentionally have no editable draft. */
export async function verifySeededCatalog(storage: CatalogStorage) {
  const versions = (
    await storage.db.prepare("SELECT * FROM published_versions").all<Version>()
  ).results;
  const heads = (
    await storage.db.prepare("SELECT * FROM challenge_heads").all<Head>()
  ).results;
  for (const version of versions)
    if (
      revisionId((await storage.readObject(version.object_key)) as Revision) !==
      version.revision
    )
      throw new Error("Local archive hash verification failed.");
  for (const head of heads) {
    const registered = versions.some(
      (v) =>
        v.challenge_key === head.challenge_key &&
        v.revision === head.published_revision,
    );
    if (
      head.lifecycle === "archived" &&
      head.draft_object === null &&
      head.draft_digest === null &&
      registered
    )
      continue;
    if (
      !head.draft_object ||
      !head.draft_digest ||
      (await digest(await storage.readObject(head.draft_object))) !==
        head.draft_digest
    )
      throw new Error("Local source digest verification failed.");
  }
  const state = await storage.catalogState();
  if (!state?.active_object)
    throw new Error("Local catalog pointer is missing.");
  const published = verifyCatalog(
    await storage.readObject(state.active_object),
  );
  return {
    verifiedLocalHeads: heads.length,
    verifiedLocalArchives: versions.length,
    activeChallenges: published.challenges.length,
  };
}
