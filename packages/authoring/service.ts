import type { Catalog, ChallengeMetadata, Revision } from "../content/model";
import type { ChallengeSource } from "../content/source";
import { revisionId, verifyCatalog } from "../content/revision";
import { canonical, type Json } from "../domain/json";
import {
  CatalogStorage,
  AuthoringConflict,
  AuthoringUnavailable,
  type Head,
  type Version,
  type Statement,
} from "./storage";
import type {
  EditorDetail,
  EditorHead,
  EditorSummary,
  HistoricalChallenge,
  ValidationPlan,
  TrustedValidator,
} from "./contracts";
import { AuthoringInvalid, prepareSource, structuralProblems } from "./source";
import { digest, runtimePin } from "./runtime";
import { validationPlan, validateEvidence } from "./validation";

interface Mutation {
  requestId: string;
  expectedGeneration: number;
}
interface Session {
  token: string;
  challenge_key: string;
  generation: number;
  draft_digest: string;
  runtime_fingerprint: string;
  expires_at: string;
  consumed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  failure_code: string | null;
}
const json = (value: unknown) => canonical(value as Json);
export class AuthoringService {
  constructor(
    readonly storage: CatalogStorage,
    readonly now = () => new Date().toISOString(),
  ) {}
  async version(key: string, id: string): Promise<HistoricalChallenge | null> {
    const version = await this.storage.db
      .prepare(
        "SELECT * FROM published_versions WHERE challenge_key = ? AND revision = ?",
      )
      .bind(key, id)
      .first<Version>();
    if (!version) return null;
    const revision = (await this.storage.readObject(
      version.object_key,
    )) as Revision;
    if (revisionId(revision) !== id || revision.challenge !== key)
      throw new AuthoringUnavailable(
        "Published snapshot integrity check failed.",
      );
    const metadata = JSON.parse(version.metadata_json) as ChallengeMetadata;
    verifyCatalog({
      schemaVersion: "1.0.0",
      challenges: [metadata],
      revisions: { [id]: revision },
    });
    return {
      metadata,
      revision,
      archived: (await this.storage.head(key))?.lifecycle === "archived",
    };
  }
  async publicRevision(key: string, id?: string) {
    const head = await this.storage.head(key);
    if (!head?.published_revision || head.lifecycle === "draft") return null;
    return this.version(key, id ?? head.published_revision);
  }
  async publicCatalog(): Promise<Catalog> {
    const state = await this.storage.catalogState();
    if (!state?.seeded_at || !state.active_object)
      throw new AuthoringUnavailable(
        "Managed catalog has not been initialized.",
      );
    return verifyCatalog(await this.storage.readObject(state.active_object));
  }
  async source(head: Head): Promise<ChallengeSource | null> {
    if (!head.draft_object) return null;
    const source = await this.storage.readObject(head.draft_object);
    if ((await digest(source)) !== head.draft_digest)
      throw new AuthoringUnavailable("Draft integrity check failed.");
    return source as ChallengeSource;
  }
  private editorHead(h: Head): EditorHead {
    return {
      key: h.challenge_key,
      generation: h.generation,
      lifecycle: h.lifecycle,
      publishedRevision: h.published_revision,
      draftDigest: h.draft_digest,
      validation: h.qa_receipt ? "passed" : "unvalidated",
    };
  }
  async detail(key: string): Promise<EditorDetail> {
    const h = await this.storage.head(key);
    if (!h) throw new AuthoringInvalid("Challenge not found.");
    const source = await this.source(h);
    const head = this.editorHead(h);
    if (!h.qa_receipt && h.draft_digest) {
      const last = await this.storage.db
        .prepare(
          `SELECT token,started_at,finished_at,failure_code,expires_at FROM validation_sessions WHERE challenge_key=? AND draft_digest=? AND generation=? ORDER BY expires_at DESC LIMIT 1`,
        )
        .bind(key, h.draft_digest, h.generation)
        .first<{
          token: string;
          started_at: string | null;
          finished_at: string | null;
          failure_code: string | null;
          expires_at: string;
        }>();
      if (last) {
        head.validation =
          last.finished_at || last.expires_at <= this.now()
            ? "failed"
            : last.started_at
              ? "running"
              : "queued";
        head.validationJob = last.token;
      }
    }
    return {
      head,
      source,
      runtime: source ? await runtimePin(source.revision.language) : null,
    };
  }
  async list(): Promise<EditorSummary[]> {
    const rows = await this.storage.db
      .prepare(
        `SELECT h.*,v.metadata_json,s.token AS validation_token,
        s.started_at AS validation_started,s.finished_at AS validation_finished,s.expires_at AS validation_expires
        FROM challenge_heads h
      LEFT JOIN published_versions v ON v.revision = h.published_revision
      LEFT JOIN validation_sessions s ON s.token=(SELECT token FROM validation_sessions
        WHERE challenge_key=h.challenge_key AND draft_digest=h.draft_digest AND generation=h.generation
        ORDER BY expires_at DESC LIMIT 1)
      ORDER BY h.challenge_key`,
      )
      .all<
        Head & {
          metadata_json: string | null;
          validation_token: string | null;
          validation_started: string | null;
          validation_finished: string | null;
          validation_expires: string | null;
        }
      >();
    return rows.results.map((h) => {
      const m = JSON.parse(h.draft_metadata ?? h.metadata_json ?? "{}");
      const head = this.editorHead(h);
      if (!h.qa_receipt && h.validation_token) {
        head.validationJob = h.validation_token;
        head.validation =
          h.validation_finished ||
          (h.validation_expires && h.validation_expires <= this.now())
            ? "failed"
            : h.validation_started
              ? "running"
              : "queued";
      }
      return {
        ...head,
        title: m.title ?? h.challenge_key,
        language: m.language ?? "",
        hasDraft: !!h.draft_object,
        benchmark: h.published_revision
          ? "blocked_configuration"
          : "unavailable",
      };
    });
  }
  private checkMutation(m: Mutation) {
    if (
      !m ||
      !/^[a-zA-Z0-9_-]{12,128}$/.test(m.requestId) ||
      !Number.isSafeInteger(m.expectedGeneration) ||
      m.expectedGeneration < 0
    )
      throw new AuthoringInvalid(
        "A valid request ID and expected generation are required.",
      );
  }
  private async checkedHead(key: string, expected: number) {
    const h = await this.storage.head(key);
    if (!h || h.generation !== expected)
      throw new AuthoringConflict(
        "This challenge changed. Reload before saving.",
      );
    return h;
  }
  async save(
    key: string,
    m: Mutation,
    value: unknown,
    create = false,
  ): Promise<EditorDetail> {
    this.checkMutation(m);
    const requestDigest = await digest({
      action: create ? "create" : "edit",
      key,
      expected: m.expectedGeneration,
      source: value,
    });
    if (await this.storage.completed(m.requestId, requestDigest))
      return this.detail(key);
    const h = await this.storage.head(key);
    if (
      create
        ? !!h || m.expectedGeneration !== 0
        : !h || h.generation !== m.expectedGeneration
    )
      throw new AuthoringConflict(
        "This challenge changed or the ID is already reserved.",
      );
    const old = h?.published_revision
      ? await this.version(key, h.published_revision)
      : null;
    const row = h?.published_revision
      ? await this.storage.db
          .prepare(
            "SELECT runtime_fingerprint FROM published_versions WHERE revision = ?",
          )
          .bind(h.published_revision)
          .first<{ runtime_fingerprint: string }>()
      : null;
    const prepared = await prepareSource(
      value,
      old && row ? { ...old, runtime: row.runtime_fingerprint } : undefined,
    );
    if (prepared.source.metadata.key !== key)
      throw new AuthoringInvalid("The challenge ID cannot change.");
    const objectKey = `private/drafts/${key}/${prepared.draftDigest.slice(7)}.json`;
    await this.storage.immutableObject(objectKey, json(prepared.source));
    const at = this.now(),
      meta = json({
        ...prepared.source.metadata,
        language: prepared.source.revision.language,
      });
    await this.storage.operation(
      {
        id: m.requestId,
        digest: requestDigest,
        key,
        expected: m.expectedGeneration,
        action: create ? "create" : "edit",
        revision: null,
        at,
        result: { key, generation: m.expectedGeneration + 1 },
      },
      [
        create
          ? this.storage.db
              .prepare(
                `INSERT INTO challenge_heads
        (challenge_key,generation,lifecycle,draft_object,draft_digest,draft_metadata,updated_at) VALUES (?,1,'draft',?,?,?,?)`,
              )
              .bind(key, objectKey, prepared.draftDigest, meta, at)
          : this.storage.db
              .prepare(
                `UPDATE challenge_heads SET generation = generation + 1,draft_object=?,draft_digest=?,draft_metadata=?,qa_receipt=NULL,updated_at=? WHERE challenge_key=?`,
              )
              .bind(objectKey, prepared.draftDigest, meta, at, key),
      ],
    );
    return this.detail(key);
  }
  private async assertRuntime(
    source: ChallengeSource,
    runtime: Awaited<ReturnType<typeof runtimePin>>,
  ) {
    const pin = source.revision.publication?.runtime;
    const baseline = pin
      ? null
      : await this.storage.db
          .prepare(
            "SELECT runtime_fingerprint FROM published_versions WHERE revision=?",
          )
          .bind(revisionId(source.revision))
          .first<{ runtime_fingerprint: string }>();
    if (
      pin
        ? pin.fingerprint !== runtime.fingerprint
        : baseline?.runtime_fingerprint !== runtime.fingerprint
    )
      throw new AuthoringInvalid(
        "The runtime changed. Save the draft to pin the current runtime before validation.",
      );
  }
  private async beginValidation(
    key: string,
    m: Mutation,
  ): Promise<ValidationPlan> {
    this.checkMutation(m);
    const requestDigest = await digest({
      action: "begin-validation",
      key,
      expected: m.expectedGeneration,
    });
    const prior = await this.storage.completed<{ token: string }>(
      m.requestId,
      requestDigest,
    );
    const h = prior
      ? await this.storage.head(key)
      : await this.checkedHead(key, m.expectedGeneration);
    if (!h) throw new AuthoringConflict("Draft not found.");
    const source = await this.source(h);
    if (!source || !h.draft_digest)
      throw new AuthoringInvalid("Save a private draft before validation.");
    const runtime = await runtimePin(source.revision.language);
    await this.assertRuntime(source, runtime);
    const token = prior?.token ?? crypto.randomUUID();
    let generation = h.generation + 1,
      expiresAt = new Date(
        Date.parse(this.now()) + 30 * 60 * 1000,
      ).toISOString();
    if (prior) {
      const session = await this.storage.db
        .prepare("SELECT * FROM validation_sessions WHERE token=?")
        .bind(token)
        .first<Session>();
      if (
        !session ||
        session.expires_at <= this.now() ||
        session.consumed_at ||
        session.generation !== h.generation ||
        session.draft_digest !== h.draft_digest
      )
        throw new AuthoringConflict(
          "Validation session expired or draft changed. Run validation again.",
        );
      expiresAt = session.expires_at;
      generation = session.generation;
    }
    const plan = await validationPlan(
      source,
      runtime,
      generation,
      h.draft_digest,
      token,
      expiresAt,
    );
    if (!prior)
      await this.storage.operation(
        {
          id: m.requestId,
          digest: requestDigest,
          key,
          expected: h.generation,
          action: "validation.start",
          revision: null,
          at: this.now(),
          result: { token },
        },
        [
          this.storage.db
            .prepare(
              "UPDATE challenge_heads SET generation=generation+1,qa_receipt=NULL,updated_at=? WHERE challenge_key=?",
            )
            .bind(this.now(), key),
          this.storage.db
            .prepare(
              `INSERT INTO validation_sessions(token,challenge_key,generation,draft_digest,runtime_fingerprint,expires_at) VALUES (?,?,?,?,?,?)`,
            )
            .bind(
              token,
              key,
              generation,
              h.draft_digest,
              runtime.fingerprint,
              expiresAt,
            ),
        ],
      );
    return plan;
  }
  private async finishValidation(
    key: string,
    token: string,
    m: Mutation,
    reported: unknown,
  ): Promise<EditorDetail> {
    this.checkMutation(m);
    const requestDigest = await digest({
      action: "finish-validation",
      key,
      token,
      expected: m.expectedGeneration,
      runs: reported,
    });
    if (await this.storage.completed(m.requestId, requestDigest))
      return this.detail(key);
    const h = await this.checkedHead(key, m.expectedGeneration),
      source = await this.source(h);
    const session = await this.storage.db
      .prepare(
        "SELECT * FROM validation_sessions WHERE token=? AND challenge_key=?",
      )
      .bind(token, key)
      .first<Session>();
    const runtime = source ? await runtimePin(source.revision.language) : null;
    if (
      !session ||
      !source ||
      !runtime ||
      !h.draft_digest ||
      session.consumed_at ||
      session.expires_at <= this.now() ||
      session.generation !== h.generation ||
      session.draft_digest !== h.draft_digest ||
      session.runtime_fingerprint !== runtime.fingerprint
    )
      throw new AuthoringConflict(
        "Validation session expired or the draft/runtime changed.",
      );
    const plan = await validationPlan(
      source,
      runtime,
      h.generation,
      h.draft_digest,
      token,
      session.expires_at,
    );
    const runs = validateEvidence(plan, reported);
    const objectKey = `private/validation/${key}/${token}.json`;
    await this.storage.immutableObject(
      objectKey,
      json({ provenance: "trusted-operator-cli", plan, runs }),
    );
    const at = this.now();
    await this.storage.operation(
      {
        id: m.requestId,
        digest: requestDigest,
        key,
        expected: h.generation,
        action: "validation.complete",
        revision: revisionId(source.revision),
        at,
        result: { key, generation: h.generation + 1 },
      },
      [
        this.storage.db
          .prepare(
            `INSERT INTO qa_receipts(receipt_id,challenge_key,draft_digest,runtime_fingerprint,evidence_object,passed_at) VALUES (?,?,?,?,?,?)`,
          )
          .bind(token, key, h.draft_digest, runtime.fingerprint, objectKey, at),
        this.storage.db
          .prepare(
            "UPDATE validation_sessions SET consumed_at=?,finished_at=? WHERE token=?",
          )
          .bind(at, at, token),
        this.storage.db
          .prepare(
            "UPDATE challenge_heads SET generation=generation+1,qa_receipt=?,updated_at=? WHERE challenge_key=?",
          )
          .bind(token, at, key),
      ],
    );
    return this.detail(key);
  }
  async requestValidation(key: string, m: Mutation): Promise<EditorDetail> {
    this.checkMutation(m);
    const requestDigest = await digest({
      action: "begin-validation",
      key,
      expected: m.expectedGeneration,
    });
    const prior = await this.storage.completed(m.requestId, requestDigest);
    if (!prior) await this.beginValidation(key, m);
    return this.detail(key);
  }
  /** Trusted operator tooling only. Never exposed as an HTTP callback or browser pass flag. */
  async runValidationJob(
    token: string,
    validator: TrustedValidator,
  ): Promise<EditorDetail> {
    const session = await this.storage.db
      .prepare("SELECT * FROM validation_sessions WHERE token=?")
      .bind(token)
      .first<Session>();
    if (!session) throw new AuthoringInvalid("Validation job not found.");
    const key = session.challenge_key;
    const receipt = await this.storage.db
      .prepare(
        "SELECT receipt_id FROM qa_receipts WHERE receipt_id=? AND challenge_key=?",
      )
      .bind(token, key)
      .first();
    if (receipt) return this.detail(key);
    const h = await this.checkedHead(key, session.generation),
      source = await this.source(h);
    if (
      !source ||
      !h.draft_digest ||
      session.expires_at <= this.now() ||
      session.draft_digest !== h.draft_digest
    )
      throw new AuthoringConflict(
        "Validation job expired or the draft changed.",
      );
    const runtime = await runtimePin(source.revision.language);
    await this.assertRuntime(source, runtime);
    if (runtime.fingerprint !== session.runtime_fingerprint)
      throw new AuthoringConflict(
        "Validation runtime changed. Queue a fresh job.",
      );
    const plan = await validationPlan(
      source,
      runtime,
      h.generation,
      h.draft_digest,
      token,
      session.expires_at,
    );
    const claimed = await this.storage.db
      .prepare(
        `UPDATE validation_sessions SET started_at=? WHERE token=? AND started_at IS NULL AND consumed_at IS NULL RETURNING token`,
      )
      .bind(this.now(), token)
      .first();
    if (!claimed)
      throw new AuthoringConflict(
        "This validation is running or already attempted. Queue a new explicit attempt after checking its state.",
      );
    try {
      const runs = await validator.run(plan);
      return await this.finishValidation(
        key,
        token,
        {
          requestId: `finish_${(await digest(token)).slice(7)}`,
          expectedGeneration: plan.generation,
        },
        runs,
      );
    } catch (error) {
      await this.storage.db.batch([
        this.storage.db
          .prepare(
            "UPDATE validation_sessions SET finished_at=?,failure_code=? WHERE token=?",
          )
          .bind(
            this.now(),
            error instanceof AuthoringInvalid
              ? "checks_failed"
              : "runtime_unavailable",
            token,
          ),
      ]);
      throw error;
    }
  }
  async publish(key: string, m: Mutation): Promise<EditorDetail> {
    return this.transition(key, m, "publish");
  }
  async archive(key: string, m: Mutation): Promise<EditorDetail> {
    return this.transition(key, m, "archive");
  }
  private async transition(
    key: string,
    m: Mutation,
    action: "publish" | "archive",
  ): Promise<EditorDetail> {
    this.checkMutation(m);
    const requestDigest = await digest({
      action,
      key,
      expected: m.expectedGeneration,
    });
    if (await this.storage.completed(m.requestId, requestDigest))
      return this.detail(key);
    const h = await this.checkedHead(key, m.expectedGeneration);
    const state = await this.storage.catalogState();
    if (!state?.seeded_at || !state.active_object)
      throw new AuthoringUnavailable(
        "Initialize the managed catalog before publishing.",
      );
    const loaded = await this.publicCatalog();
    const current: {
      schemaVersion: "1.0.0";
      challenges: ChallengeMetadata[];
      revisions: Record<string, Revision>;
    } = {
      schemaVersion: "1.0.0",
      challenges: [...loaded.challenges],
      revisions: { ...loaded.revisions },
    };
    let source: ChallengeSource | null = null,
      id = h.published_revision;
    const at = this.now();
    const statements: Statement[] = [];
    if (action === "publish") {
      source = await this.source(h);
      if (!source || !h.qa_receipt)
        throw new AuthoringInvalid(
          "Run and pass exact-version validation before publishing.",
        );
      const qa = await this.storage.db
        .prepare(
          "SELECT draft_digest,runtime_fingerprint FROM qa_receipts WHERE receipt_id=? AND challenge_key=?",
        )
        .bind(h.qa_receipt, key)
        .first<{ draft_digest: string; runtime_fingerprint: string }>();
      const runtime = await runtimePin(source.revision.language);
      if (
        !qa ||
        qa.draft_digest !== h.draft_digest ||
        qa.runtime_fingerprint !== runtime.fingerprint
      )
        throw new AuthoringInvalid("QA is stale for this draft or runtime.");
      await this.assertRuntime(source, runtime);
      const problems = structuralProblems(source);
      if (problems.length)
        throw new AuthoringInvalid("Structural validation failed.", problems);
      id = revisionId(source.revision);
      const objectKey = `published/revisions/${id.slice(7)}.json`;
      await this.storage.immutableObject(objectKey, json(source.revision));
      const metadata = { ...source.metadata, revision: id };
      const existing = await this.storage.db
        .prepare("SELECT * FROM published_versions WHERE revision=?")
        .bind(id)
        .first<Version>();
      if (
        existing &&
        (existing.challenge_key !== key ||
          existing.metadata_json !== json(metadata) ||
          existing.runtime_fingerprint !== runtime.fingerprint)
      )
        throw new AuthoringConflict("Immutable published version differs.");
      if (!existing)
        statements.push(
          this.storage.db
            .prepare(
              `INSERT INTO published_versions
        (revision,challenge_key,object_key,metadata_json,runtime_fingerprint,published_at) VALUES (?,?,?,?,?,?)`,
            )
            .bind(id, key, objectKey, json(metadata), runtime.fingerprint, at),
        );
      statements.push(
        this.storage.db
          .prepare(
            `INSERT OR IGNORE INTO publication_intents(revision,challenge_key,state,created_at) VALUES (?,?,'blocked_configuration',?)`,
          )
          .bind(id, key, at),
      );
      current.challenges = [
        ...current.challenges.filter((c) => c.key !== key),
        metadata,
      ].sort((a, b) => a.key.localeCompare(b.key));
      current.revisions = { ...current.revisions, [id]: source.revision };
    } else {
      if (!id || h.lifecycle !== "published")
        throw new AuthoringInvalid(
          "Only a published challenge can be archived.",
        );
      current.challenges = current.challenges.filter((c) => c.key !== key);
    }
    // Public index stores only currently discoverable revisions; history is in registry/R2.
    current.revisions = Object.fromEntries(
      current.challenges.map((c) => [
        c.revision,
        current.revisions[c.revision],
      ]),
    );
    verifyCatalog(current);
    const catalogObject = `published/catalogs/${(await digest(current)).slice(7)}.json`;
    await this.storage.immutableObject(catalogObject, json(current));
    statements.push(
      this.storage.db
        .prepare(
          "UPDATE challenge_heads SET generation=generation+1,lifecycle=?,published_revision=?,updated_at=? WHERE challenge_key=?",
        )
        .bind(action === "publish" ? "published" : "archived", id, at, key),
    );
    statements.push(
      this.storage.db
        .prepare("UPDATE catalog_state SET active_object=? WHERE singleton=1")
        .bind(catalogObject),
    );
    await this.storage.operation(
      {
        id: m.requestId,
        digest: requestDigest,
        key,
        expected: h.generation,
        catalogExpected: state.generation,
        action,
        revision: id,
        at,
        result: { key, generation: h.generation + 1 },
      },
      statements,
    );
    return this.detail(key);
  }
}
