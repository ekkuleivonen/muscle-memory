/** Narrow Cloudflare-shaped interfaces; no credentials or live resource creation. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface CatalogDatabase {
  prepare(sql: string): Statement;
  /** D1 batches are ordered and atomic: any failing statement rolls back all writes. */
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface ContentObject {
  text(): Promise<string>;
}
export interface ContentBucket {
  get(key: string): Promise<ContentObject | null>;
  /** Conditional create only; a null result means that key already exists. */
  put(
    key: string,
    value: string,
    options: { onlyIf: { etagDoesNotMatch: string } },
  ): Promise<unknown | null>;
}
export class AuthoringConflict extends Error {}
export class AuthoringUnavailable extends Error {}

export interface Head {
  challenge_key: string;
  generation: number;
  lifecycle: "draft" | "published" | "archived";
  published_revision: string | null;
  draft_object: string | null;
  draft_digest: string | null;
  draft_metadata: string | null;
  qa_receipt: string | null;
  updated_at: string;
}
export interface Version {
  revision: string;
  challenge_key: string;
  object_key: string;
  metadata_json: string;
  runtime_fingerprint: string;
  published_at: string;
}
export class CatalogStorage {
  constructor(
    readonly db: CatalogDatabase,
    readonly bucket: ContentBucket,
  ) {}
  head(key: string) {
    return this.db
      .prepare("SELECT * FROM challenge_heads WHERE challenge_key = ?")
      .bind(key)
      .first<Head>();
  }
  catalogState() {
    return this.db
      .prepare("SELECT * FROM catalog_state WHERE singleton = 1")
      .first<{
        generation: number;
        active_object: string | null;
        seeded_at: string | null;
      }>();
  }
  async completed<T>(id: string, digest: string): Promise<T | null> {
    if (!/^[a-zA-Z0-9_-]{12,128}$/.test(id))
      throw new AuthoringConflict("Invalid request ID.");
    const row = await this.db
      .prepare(
        "SELECT request_digest, result_json FROM operator_mutations WHERE request_id = ?",
      )
      .bind(id)
      .first<{ request_digest: string; result_json: string }>();
    if (!row) return null;
    if (row.request_digest !== digest)
      throw new AuthoringConflict(
        "Request ID already used for different content.",
      );
    return JSON.parse(row.result_json) as T;
  }
  async failedAudit(
    requestId: string,
    key: string,
    action: string,
    code: string,
    at: string,
  ) {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO operator_audit
      (audit_id,request_id,action,challenge_key,revision,occurred_at,result,failure_code)
      VALUES (?,?,?,?,NULL,?,'failed',?)`,
        )
        .bind(crypto.randomUUID(), requestId, action, key, at, code),
    ]);
  }
  async immutableObject(key: string, text: string) {
    const result = await this.bucket.put(key, text, {
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (result === null) {
      const old = await this.bucket.get(key);
      if (!old || (await old.text()) !== text)
        throw new AuthoringConflict("Immutable object differs.");
    }
  }
  async readObject(key: string): Promise<unknown> {
    const object = await this.bucket.get(key);
    if (!object)
      throw new AuthoringUnavailable("Content snapshot unavailable.");
    return JSON.parse(await object.text());
  }
  async operation<T>(
    request: {
      id: string;
      digest: string;
      key: string;
      expected: number;
      catalogExpected?: number;
      action:
        | "create"
        | "edit"
        | "validate"
        | "validation.start"
        | "validation.complete"
        | "publish"
        | "archive";
      revision: string | null;
      at: string;
      result: T;
    },
    statements: Statement[],
  ): Promise<T> {
    if (!/^[a-zA-Z0-9_-]{12,128}$/.test(request.id))
      throw new AuthoringConflict("Invalid request ID.");
    const prior = () =>
      this.db
        .prepare(
          "SELECT request_digest, result_json FROM operator_mutations WHERE request_id = ?",
        )
        .bind(request.id)
        .first<{ request_digest: string; result_json: string }>();
    const replay = (row: { request_digest: string; result_json: string }) => {
      if (row.request_digest !== request.digest)
        throw new AuthoringConflict(
          "Request ID already used for different content.",
        );
      return JSON.parse(row.result_json) as T;
    };
    const existing = await prior();
    if (existing) return replay(existing);
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO operator_mutations
          (request_id,request_digest,challenge_key,expected_generation,expected_catalog_generation,action,result_json,occurred_at)
          VALUES (?,?,?,?,?,?,?,?)`,
          )
          .bind(
            request.id,
            request.digest,
            request.key,
            request.expected,
            request.catalogExpected ?? null,
            request.action,
            JSON.stringify(request.result),
            request.at,
          ),
        ...statements,
        this.db
          .prepare(
            `INSERT INTO operator_audit
          (audit_id,request_id,action,challenge_key,revision,occurred_at,result) VALUES (?,?,?,?,?,?,'succeeded')`,
          )
          .bind(
            request.id,
            request.id,
            request.action,
            request.key,
            request.revision,
            request.at,
          ),
        ...(request.action === "publish" || request.action === "archive"
          ? [
              this.db.prepare(
                "UPDATE catalog_state SET generation = generation + 1 WHERE singleton = 1",
              ),
            ]
          : []),
      ]);
      return request.result;
    } catch (error) {
      const completed = await prior();
      if (completed) return replay(completed);
      const head = await this.head(request.key);
      if ((head?.generation ?? 0) !== request.expected)
        throw new AuthoringConflict(
          "This challenge changed. Reload before saving.",
        );
      if (
        request.catalogExpected !== undefined &&
        (await this.catalogState())?.generation !== request.catalogExpected
      )
        throw new AuthoringConflict(
          "Published catalog changed. Retry after refreshing.",
        );
      throw error;
    }
  }
}
