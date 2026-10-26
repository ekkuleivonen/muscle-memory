/** One-off, explicitly targeted seed transport. Never imported by the app. No credentials stored. */
import type {
  CatalogDatabase,
  ContentBucket,
  Statement,
} from "../packages/authoring/storage";
export function remoteCatalog(
  target: { account: string; database: string; bucket: string },
  authorization: string,
  request: typeof fetch = fetch,
) {
  if (
    !/^[a-f0-9]{32}$/.test(target.account) ||
    !/^[a-f0-9-]{36}$/.test(target.database) ||
    target.bucket !== "muscle-memory-content"
  )
    throw new Error("Invalid explicit catalog target.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${target.account}`;
  const call = async (path: string, init: RequestInit = {}) =>
    request(base + path, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(30000),
    });
  const json = async (path: string, init: RequestInit = {}) => {
    const response = await call(path, init),
      body = (await response.json()) as any;
    if (!response.ok || body.success !== true)
      throw new Error(
        `Catalog API failed (${response.status}); outcome may be uncertain. Inspect target state before retrying. Codes: ${(body.errors ?? []).map((e: any) => e.code).join(",")}`,
      );
    return body.result;
  };
  const query = async (batch: { sql: string; params: unknown[] }[]) => {
    const rows = await json(`/d1/database/${target.database}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch }),
    });
    if (!Array.isArray(rows) || rows.some((r) => r.success === false))
      throw new Error("D1 batch failed; inspect state before retry.");
    return rows;
  };
  class RemoteStatement implements Statement {
    constructor(
      readonly sql: string,
      readonly params: unknown[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new RemoteStatement(this.sql, params);
    }
    async all<T>() {
      return {
        results:
          ((await query([{ sql: this.sql, params: this.params }]))[0]
            ?.results as T[]) ?? [],
      };
    }
    async first<T>() {
      return (await this.all<T>()).results[0] ?? null;
    }
  }
  const db: CatalogDatabase = {
    prepare: (sql) => new RemoteStatement(sql),
    batch: (statements) =>
      query(
        statements.map((s) => {
          if (!(s instanceof RemoteStatement))
            throw new Error("Foreign statement in catalog batch.");
          return { sql: s.sql, params: s.params };
        }),
      ),
  };
  const objectPath = (key: string) =>
    `/r2/buckets/${target.bucket}/objects/${encodeURIComponent(key)}`;
  const bucket: ContentBucket = {
    async get(key) {
      const r = await call(objectPath(key));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`R2 read failed (${r.status}).`);
      const value = await r.text();
      return { text: async () => value };
    },
    async put(key, text) {
      // Seed only: the new bucket has no live app binding/writers. Never overwrite an existing key.
      if (await bucket.get(key)) return null;
      const r = await call(objectPath(key), {
        method: "PUT",
        headers: { "content-type": "application/json", "If-None-Match": "*" },
        body: text,
      });
      if (r.status === 412) return null;
      if (!r.ok)
        throw new Error(
          `R2 write failed (${r.status}); inspect the object before retrying.`,
        );
      const stored = await bucket.get(key);
      if (!stored || (await stored.text()) !== text)
        throw new Error("R2 write could not be verified.");
      return { verified: true };
    },
  };
  return {
    db,
    bucket,
    query,
    async assertTargets() {
      const d = await json(`/d1/database/${target.database}`);
      if (d.name !== "muscle-memory-catalog")
        throw new Error("D1 name does not match approved target.");
      const b = await json(`/r2/buckets/${target.bucket}`);
      if (b.name !== target.bucket)
        throw new Error("R2 name does not match approved target.");
    },
  };
}
