"use client";

import { useEffect, useRef, useState } from "react";
import type {
  EditorDetail,
  EditorSummary,
} from "../../../../../packages/authoring/contracts";
import type { ChallengeSource } from "../../../../../packages/content/source";
import { KEY_CODES } from "../../../../../packages/content/keys";

const API = "/admin/api/challenges";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request failed. Retry when your connection is ready.";

class HttpError extends Error {}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    mode: "same-origin",
    redirect: "error",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const reason =
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${response.status}).`;
    const details = Array.isArray(data?.problems)
      ? `\n${data.problems.join("\n")}`
      : "";
    throw new HttpError(
      `${reason}${details}${response.status === 409 ? "\nThis draft changed elsewhere. Your text is still here; copy it before reloading the latest version." : ""}`,
    );
  }
  if (!data)
    throw new Error(
      "The server returned an unreadable response. Retry without leaving this page.",
    );
  return data as T;
}

export function AuthoringList() {
  const [items, setItems] = useState<EditorSummary[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems((await request<{ items: EditorSummary[] }>(API)).items);
    } catch (error) {
      setError(message(error));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="authoring">
      <h1>Challenge authoring</h1>
      <p>
        Private drafts, validated immutable publication, and reversible archive.
      </p>
      <div className="authoring-actions">
        <a href="/admin/authoring/new">Create challenge</a>
        <button onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {items && (
        <div
          className="admin-inventory"
          role="region"
          aria-label="Managed challenges"
          tabIndex={0}
        >
          <table>
            <caption>{items.length} managed challenges</caption>
            <thead>
              <tr>
                {[
                  "Key",
                  "Title",
                  "Language",
                  "Lifecycle",
                  "Draft",
                  "Generation",
                  "Validation",
                  "Benchmarks",
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <th scope="row">
                    <a
                      href={`/admin/authoring/${encodeURIComponent(item.key)}`}
                    >
                      {item.key}
                    </a>
                  </th>
                  <td>{item.title}</td>
                  <td>{item.language}</td>
                  <td>{item.lifecycle}</td>
                  <td>{item.hasDraft ? "Private draft" : "No draft"}</td>
                  <td>{item.generation}</td>
                  <td>{item.validation}</td>
                  <td>
                    {item.benchmark === "blocked_configuration"
                      ? "Blocked: configuration required"
                      : "Unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items?.length === 0 && (
        <p>No managed challenges yet. Create a private draft to begin.</p>
      )}
    </section>
  );
}

type Fields = Record<
  | "key"
  | "title"
  | "summary"
  | "hook"
  | "difficulty"
  | "tags"
  | "language"
  | "task"
  | "file"
  | "entrypoint"
  | "parameters"
  | "starter"
  | "cases"
  | "rules"
  | "schema"
  | "adapter"
  | "solution"
  | "alternatives"
  | "wrong"
  | "examples",
  string
>;
const blank: Fields = {
  key: "",
  title: "",
  summary: "",
  hook: "",
  difficulty: "easy",
  tags: "[]",
  language: "javascript",
  task: "",
  file: "solution.js",
  entrypoint: "solve",
  parameters: "",
  starter: "",
  cases: "[]",
  rules: "[]",
  schema: "",
  adapter: "",
  solution: "",
  alternatives: "[]",
  wrong: "[]",
  examples: "{}",
};
function fieldsFor(source: ChallengeSource): Fields {
  const { metadata: m, revision: r, private: p } = source;
  return {
    key: m.key,
    title: m.title,
    summary: m.summary,
    hook: m.hook ?? "",
    difficulty: m.difficulty,
    tags: json(m.tags),
    language: r.language,
    task: r.task,
    file: r.file,
    entrypoint: r.entrypoint,
    parameters: r.parameters ? json(r.parameters) : "",
    starter: r.starter,
    cases: json(r.cases),
    rules: json(r.rules),
    schema: r.schema ?? "",
    adapter: r.adapter ?? "",
    solution: p.solution,
    alternatives: json(p.alternatives),
    wrong: json(p.wrong),
    examples: json(p.examples),
  };
}
function sourceFor(f: Fields): ChallengeSource {
  function parse(name: keyof Fields) {
    try {
      return JSON.parse(f[name]);
    } catch {
      throw new Error(
        `${name}: enter valid JSON. Your text has been preserved.`,
      );
    }
  }
  return {
    metadata: {
      key: f.key,
      title: f.title,
      summary: f.summary,
      ...(f.hook ? { hook: f.hook } : {}),
      difficulty: f.difficulty as "easy" | "medium" | "hard",
      tags: parse("tags"),
    },
    revision: {
      challenge: f.key,
      language: f.language,
      task: f.task,
      file: f.file,
      entrypoint: f.entrypoint,
      starter: f.starter,
      ...(f.parameters.trim() ? { parameters: parse("parameters") } : {}),
      ...(f.schema ? { schema: f.schema } : {}),
      ...(f.adapter ? { adapter: f.adapter } : {}),
      cases: parse("cases"),
      rules: parse("rules"),
    },
    private: {
      solution: f.solution,
      alternatives: parse("alternatives"),
      wrong: parse("wrong"),
      examples: parse("examples"),
    },
  };
}

export function AuthoringEditor({ challengeKey }: { challengeKey?: string }) {
  const [detail, setDetail] = useState<EditorDetail | null>(null);
  const [fields, setFields] = useState<Fields>(blank);
  const [saved, setSaved] = useState(json(blank));
  const [loading, setLoading] = useState(Boolean(challengeKey));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const validationRequest = useRef<{
    generation: number;
    requestId: string;
  } | null>(null);
  const requests = useRef(new Map<string, string>());
  const dirty = json(fields) !== saved;
  const key = detail?.head.key ?? challengeKey;
  const path = `${API}/${encodeURIComponent(key ?? "")}`;
  // Keep the same id for an identical retry after an uncertain network outcome.
  function mutation<T>(url: string, method: string, body: object) {
    const signature = json({ url, method, body });
    let requestId = requests.current.get(signature);
    if (!requestId) {
      requestId = crypto.randomUUID();
      requests.current.set(signature, requestId);
    }
    return request<T>(url, method, { requestId, ...body });
  }
  function accept(next: EditorDetail, replaceFields: boolean) {
    setDetail(next);
    if (replaceFields && next.source) {
      const loaded = fieldsFor(next.source);
      setFields(loaded);
      setSaved(json(loaded));
    }
  }
  async function load() {
    if (!challengeKey) return;
    setLoading(true);
    setError("");
    try {
      accept(
        await request<EditorDetail>(
          `${API}/${encodeURIComponent(challengeKey)}`,
        ),
        true,
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [challengeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  async function save() {
    setBusy("save");
    setError("");
    setStatus("");
    try {
      const source = sourceFor(fields);
      const next = await mutation<EditorDetail>(
        key ? path : API,
        key ? "PUT" : "POST",
        { expectedGeneration: detail?.head.generation ?? 0, source },
      );
      accept(next, true);
      setStatus(
        "Private draft saved. Validate this generation before publishing.",
      );
    } catch (error) {
      setError(`${message(error)}\nYour form text is still here.`);
    } finally {
      setBusy("");
    }
  }
  async function lifecycle(action: "publish" | "archive") {
    if (!detail) return;
    setBusy(action);
    setError("");
    setStatus("");
    try {
      accept(
        await mutation<EditorDetail>(`${path}/${action}`, "POST", {
          expectedGeneration: detail.head.generation,
        }),
        false,
      );
      setStatus(
        action === "publish"
          ? "Published immutable revision. Benchmarks remain blocked until configured."
          : "Archived. Historical revisions remain available; publishing can restore this challenge.",
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy("");
    }
  }
  async function validate() {
    if (!detail) return;
    setBusy("validation");
    setError("");
    setStatus(
      "Queuing validation for this saved draft. The operator runner executes it separately.",
    );
    if (validationRequest.current?.generation !== detail.head.generation) {
      validationRequest.current = {
        generation: detail.head.generation,
        requestId: crypto.randomUUID(),
      };
    }
    try {
      const next = await request<EditorDetail>(
        `${path}/validation`,
        "POST",
        {
          requestId: validationRequest.current.requestId,
          expectedGeneration: detail.head.generation,
        },
        AbortSignal.timeout(120_000),
      );
      validationRequest.current = null;
      accept(next, false);
      setStatus(
        next.head.validation === "passed"
          ? "Trusted validation passed for this saved draft and runtime."
          : next.head.validation === "queued"
            ? "Validation queued. The trusted operator validator must run this exact-version job; refresh to read its result."
            : "Trusted validation did not pass. Review the reported failure before retrying.",
      );
    } catch (error) {
      if (error instanceof HttpError) {
        validationRequest.current = null;
        setError(message(error));
        setStatus(
          "Trusted validation did not complete successfully. Draft editing remains available.",
        );
      } else {
        setError(
          "The validation response could not be confirmed. The server may still be working. Retry to check the same request. Your draft text is still here.",
        );
        setStatus(
          "Validation outcome is uncertain; no passing result is assumed.",
        );
      }
    } finally {
      setBusy("");
    }
  }
  function field(
    name: keyof Fields,
    label: string,
    hint?: string,
    rows?: number,
  ) {
    return (
      <label key={name} htmlFor={`authoring-${name}`}>
        <span>{label}</span>
        {hint && <small id={`hint-${name}`}>{hint}</small>}
        {rows ? (
          <textarea
            id={`authoring-${name}`}
            value={fields[name]}
            rows={rows}
            spellCheck={false}
            aria-describedby={hint ? `hint-${name}` : undefined}
            onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
          />
        ) : (
          <input
            id={`authoring-${name}`}
            value={fields[name]}
            readOnly={name === "key" && Boolean(key)}
            aria-describedby={hint ? `hint-${name}` : undefined}
            onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
          />
        )}
      </label>
    );
  }
  return (
    <section className="authoring">
      <p>
        <a href="/admin/authoring">← Challenge authoring</a>
      </p>
      <h1>{key ? `Edit ${key}` : "Create challenge"}</h1>
      {loading && <p role="status">Loading private source…</p>}
      {error && <p role="alert">{error}</p>}
      {challengeKey && !detail && !loading && (
        <button onClick={() => void load()}>Retry loading</button>
      )}
      {detail && (
        <dl className="authoring-status">
          <dt>Lifecycle</dt>
          <dd>{detail.head.lifecycle}</dd>
          <dt>Generation</dt>
          <dd>{detail.head.generation}</dd>
          <dt>Validation</dt>
          <dd>
            {detail.head.validation}
            {detail.head.validation === "queued"
              ? " — waiting for a trusted validation worker; availability is not confirmed. Refresh for status."
              : ""}
            {detail.head.validation === "failed"
              ? " — checks failed, execution was unavailable, or the job expired. Queue a new explicit attempt after reviewing the worker result."
              : ""}
            {dirty ? " (unsaved edits)" : ""}
          </dd>
          <dt>Published revision</dt>
          <dd>{detail.head.publishedRevision ?? "None"}</dd>
          <dt>Draft digest</dt>
          <dd>{detail.head.draftDigest ?? "None"}</dd>
          <dt>Runtime pin</dt>
          <dd>
            {detail.runtime
              ? `${detail.runtime.engine} · ${detail.runtime.version} · ${detail.runtime.fingerprint}`
              : "Not validated"}
          </dd>
          <dt>Benchmarks</dt>
          <dd>Blocked / unconfigured. No model run scheduled.</dd>
        </dl>
      )}
      {detail && !detail.source && (
        <p role="alert">
          Private authoring source is unavailable for this challenge. Editing
          and validation require a stored source bundle.
        </p>
      )}
      {(!challengeKey || detail?.source) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={Boolean(busy) || loading}>
            <h2>Challenge</h2>
            <div className="authoring-grid">
              {field(
                "key",
                "Permanent key",
                "Language code and three digits, for example JS-070. Cannot change after creation.",
              )}
              {field("title", "Title")}
            </div>
            {field("summary", "Summary")}
            {field("hook", "Share invitation (optional)")}
            <div className="authoring-grid">
              <label htmlFor="authoring-difficulty">
                Difficulty
                <select
                  id="authoring-difficulty"
                  value={fields.difficulty}
                  onChange={(e) =>
                    setFields({ ...fields, difficulty: e.target.value })
                  }
                >
                  {["easy", "medium", "hard"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="authoring-language">
                Language
                <select
                  id="authoring-language"
                  value={fields.language}
                  onChange={(e) =>
                    setFields({ ...fields, language: e.target.value })
                  }
                >
                  {Object.keys(KEY_CODES).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            {field(
              "tags",
              "Tags (JSON)",
              'Array of strings, for example ["arrays", "sorting"].',
              2,
            )}
            {field(
              "task",
              "Task (Markdown)",
              "Explain the required behavior, examples and constraints.",
              9,
            )}
            <div className="authoring-grid">
              {field(
                "file",
                "File name",
                "For example solution.js or solution.py.",
              )}
              {field(
                "entrypoint",
                "Entrypoint",
                "Function or method called by the cases.",
              )}
            </div>
            {field(
              "parameters",
              "Parameters (optional JSON)",
              'Leave blank for a single argument; otherwise a string array such as ["items", "limit"].',
              2,
            )}
            {field(
              "starter",
              "Starter code",
              "The editable file players start with.",
              10,
            )}
            {field(
              "cases",
              "Cases (JSON)",
              'Array of {"id":"case-1","input":[],"expected":[],"hidden":false}; optional "name" describes each case.',
              10,
            )}
            {field(
              "rules",
              "Static rules (JSON)",
              'Array of {"id":"rule-id","message":"Explain the constraint","when":{"pattern":"pattern","present":true}}. Empty array means no rules.',
              7,
            )}
            {fields.language === "sql" &&
              field(
                "schema",
                "SQL schema",
                "CREATE TABLE statements run before each case.",
                8,
              )}
            {["c", "cpp", "java"].includes(fields.language) &&
              field(
                "adapter",
                "JSON adapter",
                "Translate case arguments and return values for this runtime.",
                8,
              )}
            <h2>Private validation material</h2>
            <p>
              Private source and examples are for operator validation and never
              appear in the player challenge.
            </p>
            {field(
              "solution",
              "Reference solution",
              "Must pass every case and fire no rule.",
              10,
            )}
            {field(
              "alternatives",
              "Alternative correct solutions (JSON)",
              "Array of complete code strings. Each must pass all cases and rules.",
              5,
            )}
            {field(
              "wrong",
              "Wrong variants (JSON)",
              "Array of plausible incorrect code strings. Each must fail at least one case.",
              5,
            )}
            {field(
              "examples",
              "Rule examples (JSON)",
              'Object keyed by rule ID: {"rule-id":{"fires":["code"],"quiet":["code"]}}.',
              7,
            )}
            <div className="authoring-actions">
              <button type="submit">
                {busy === "save" ? "Saving…" : "Save private draft"}
              </button>
              <span>
                {dirty
                  ? "Unsaved changes"
                  : detail
                    ? "Saved"
                    : "New private draft"}
              </span>
            </div>
          </fieldset>
        </form>
      )}
      {detail && (
        <>
          <h2>Validate and publish</h2>
          <p>
            Save first, then request trusted validation for this exact draft and
            runtime. Validation requires the configured isolated validator.
            Publishing creates or restores an immutable revision.
          </p>
          <div className="authoring-actions">
            <button
              disabled={Boolean(busy) || dirty || !detail.source}
              onClick={() => void validate()}
            >
              {busy === "validation"
                ? "Queuing validation…"
                : "Queue trusted validation"}
            </button>
            <button
              disabled={
                Boolean(busy) || dirty || detail.head.validation !== "passed"
              }
              onClick={() => void lifecycle("publish")}
            >
              {detail.head.lifecycle === "archived"
                ? "Publish / restore"
                : "Publish revision"}
            </button>
            <button
              disabled={
                Boolean(busy) || dirty || detail.head.lifecycle === "archived"
              }
              onClick={() => void lifecycle("archive")}
            >
              Archive challenge
            </button>
          </div>
          <p>
            Archive removes discovery and new starts while preserving historical
            revisions and pinned attempts.
          </p>
        </>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
