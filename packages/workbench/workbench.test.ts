import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuery, SqlRejected, statementAt, statements, tokenize } from "./sql";
import { formatSql } from "./format";
import { compareValues, defuse, formatBytes, structured, toCsv, toJson, toTsv, uniqueKeys } from "./export";
import {
  DEFAULT_LIMITS,
  errorPlace,
  forgetNamespaces,
  limitsFrom,
  mentionedNamespace,
  QueryFailed,
  readSchema,
  runQuery,
  SQL_ENDPOINT,
} from "./read";

function rejected(sql: string, pattern?: RegExp) {
  assert.throws(
    () => checkQuery(sql),
    (e: unknown) => e instanceof SqlRejected && (!pattern || pattern.test(e.message)),
    sql,
  );
}

test("reads are accepted, with comments, CTEs, joins and a trailing semicolon", () => {
  const ok = [
    "SELECT 1",
    "select * from default.events limit 10;",
    "  -- recent\nSELECT type FROM default.events /* note; with a semicolon */ LIMIT 5  ;  \n-- after",
    "WITH s AS (SELECT session_id FROM default.model_events), e AS (SELECT * FROM default.events) SELECT * FROM s JOIN e ON e.session_id = s.session_id",
    "SELECT EXTRACT(YEAR FROM t.occurred_at) FROM default.events t",
    "SELECT a IS DISTINCT FROM b.c FROM default.events b",
    "SELECT trim(x FROM y.z) FROM events y",
    "SELECT ';DROP TABLE x;' AS s, 'it''s' AS t FROM default.events",
    'SELECT "update", "select" FROM default.events',
    "SELECT * FROM default.events a, default.model_events b, (SELECT 1) c WHERE a.x = b.x",
    "SELECT * FROM default.events a LEFT JOIN default.model_events b ON a.x = b.x AND a.y IN (1, 2), default.model_catalog c",
    "SELECT E'it\\'s', X'ff' FROM default.events",
    "SHOW DATABASES",
    'SELECT * FROM default.events AS "group" JOIN default.events b ON group.type = b.type, default.model_events k',
    'SELECT * FROM default.events AS "from" JOIN default.events b ON from.type = b.type',
    "SELECT substring((SELECT type FROM default.events LIMIT 1) FROM 1 FOR 2) FROM default.events",
    "EXPLAIN (SELECT 1)",
    "SELECT e.distinct FROM default.events e",
    'WITH t AS (SELECT 1 AS "group") SELECT * FROM t a JOIN t b ON a."group" = b.group, default.events k',
    "EXPLAIN ANALYZE SELECT count(*) FROM default.events",
    "EXPLAIN FORMAT JSON SELECT 1",
    "EXPLAIN VERBOSE WITH x AS (SELECT 1) SELECT * FROM x",
    "SELECT * FROM DEFAULT.events",
    'SELECT * FROM "default".events',
    'SHOW TABLES IN "default"',
    "SELECT substring((type) FROM 1 FOR 2) FROM default.events",
    "SELECT trim((type) FROM 'foo') FROM default.events",
    "SELECT * FROM default.events a JOIN default.events b ON a.type = b.type AND [1, 2] = [1, 2]",
    "SELECT a IS NOT DISTINCT FROM b FROM default.events",
    "SELECT ((SELECT 1)), x IN ((SELECT 2)) FROM default.events",
    "SELECT 5 >> 3, 5 << 3, U&'d\\0061t' FROM default.events",
    "SHOW TABLES IN default",
    "DESCRIBE default.events",
    "EXPLAIN SELECT count(*) FROM default.events",
    "(SELECT 1) UNION ALL (SELECT 2)",
    "SELECT ROW_NUMBER() OVER (PARTITION BY type ORDER BY occurred_at) FROM default.events QUALIFY 1 = 1",
    "SELECT count(*) FROM default.events GROUP BY GROUPING SETS ((type), ())",
    "SELECT * FROM (default.events e JOIN default.model_events m ON e.session_id = m.session_id)",
    "SELECT * FROM ((SELECT 1 AS x) a JOIN (SELECT 1 AS x) b ON a.x = b.x)",
    "SELECT * FROM (SELECT * FROM default.events) e, (SELECT 1) f",
  ];
  for (const sql of ok) assert.doesNotThrow(() => checkQuery(sql), sql);
  assert.equal(checkQuery("select 1;").sql, "select 1");
  assert.equal(checkQuery(" -- c\nselect 1 ; ").sql, "select 1");
});

test("writes, sessions, other namespaces and several statements are rejected server-side", () => {
  rejected("INSERT INTO default.events VALUES (1)", /Only reads/);
  rejected("UPDATE default.events SET x = 1", /Only reads/);
  rejected("DELETE FROM default.events", /Only reads/);
  rejected("DROP TABLE default.events", /Only reads/);
  rejected("CREATE TABLE x AS SELECT 1", /Only reads/);
  rejected("ALTER TABLE default.events ADD COLUMN x int", /Only reads/);
  rejected("TRUNCATE default.events");
  rejected("SET datafusion.execution.batch_size = 1", /Only reads/);
  rejected("COPY (SELECT 1) TO 's3://x'", /Only reads/);
  rejected("SELECT * INTO copy FROM default.events", /"INTO" is not allowed/);
  rejected("WITH x AS (DELETE FROM default.events RETURNING *) SELECT * FROM x", /"DELETE"/);
  rejected("EXPLAIN DELETE FROM default.events", /"DELETE"/);
  rejected("SELECT 1; DROP TABLE default.events", /one statement/);
  rejected("SELECT 1; SELECT 2", /one statement/);
  rejected("SELECT 1 -- ;\n; DELETE FROM x", /one statement/);
  rejected("SELECT 'a\\'; DROP TABLE default.events; --'", /backslash/);
  rejected("SELECT 1 /* outer /* inner */ ; DROP TABLE x */", /Nested/);
  rejected("SELECT 'unterminated", /never closed/);
  rejected("SELECT 1 /* open", /never closed/);
  rejected('SELECT "open FROM x', /never closed/);
  rejected("SELECT * FROM other.events", /"default" namespace/);
  rejected('SELECT * FROM "Other".events', /"default" namespace/);
  rejected("SELECT * FROM catalog.default.events", /namespace\.table at most/);
  rejected("SELECT * FROM default.events JOIN secrets.keys ON 1 = 1", /not "secrets"/);
  rejected("SELECT * FROM default.events e, secrets.keys k", /not "secrets"/);
  rejected("SELECT * FROM default.events a JOIN default.events b ON a.x = b.x, secrets.keys", /not "secrets"/);
  rejected("SELECT * FROM (SELECT * FROM secrets.keys) k", /not "secrets"/);
  rejected("SELECT * FROM read_parquet('s3://bucket/x')", /Table functions/);
  // Every table position, however it is written (review of PR 68).
  rejected("SELECT * FROM (secrets.keys k CROSS JOIN default.events e)", /not "secrets"/);
  rejected("SELECT * FROM (default.events e CROSS JOIN secrets.keys k)", /not "secrets"/);
  rejected("SELECT * FROM ((secrets.keys))", /not "secrets"/);
  rejected("SELECT * FROM (default.events e JOIN (secrets.keys k JOIN default.events f ON 1 = 1) ON 1 = 1)", /not "secrets"/);
  rejected("SELECT * FROM (default.events e, secrets.keys k)", /not "secrets"/);
  rejected("SELECT * FROM (catalog.default.events)", /namespace\.table at most/);
  rejected("SELECT * FROM (read_parquet('x') r)", /Table functions/);
  rejected("SELECT * FROM 'secrets'.keys", /Only a table name/);
  rejected("SELECT * FROM default.'secrets'", /Only a table name/);
  rejected("SELECT * FROM default.events JOIN 'secrets'.keys ON 1 = 1", /Only a table name/);
  rejected("SELECT * FROM default.events WHERE x IN (FROM secrets.keys SELECT k)", /not "secrets"/);
  rejected("SELECT 1 UNION TABLE secrets.keys", /"TABLE" is not allowed/);
  rejected("SELECT * FROM", /table name is missing/);
  // Review round 2: keywords as name parts, EXPLAIN around metadata, dialect names, quoting.
  rejected("SELECT e.distinct FROM secrets.keys e", /not "secrets"/);
  rejected('WITH t AS (SELECT 1 AS "group") SELECT * FROM t a JOIN t b ON a."group" = b.group, secrets.keys k', /not "secrets"/);
  rejected("EXPLAIN DESCRIBE secrets.keys", /EXPLAIN works on a query/);
  rejected("EXPLAIN SHOW TABLES IN secrets", /EXPLAIN works on a query/);
  rejected("EXPLAIN ANALYZE DESCRIBE secrets.keys", /EXPLAIN works on a query/);
  rejected("EXPLAIN FORMAT JSON SHOW TABLES IN secrets", /EXPLAIN works on a query/);
  rejected("EXPLAIN ANALYZE SELECT * FROM secrets.keys", /not "secrets"/);
  rejected("SELECT * FROM secrets@x.keys", /not "secrets@x"/);
  rejected("SELECT * FROM secrets#x.keys", /not "secrets#x"/);
  rejected('SELECT * FROM "DEFAULT".events', /not "DEFAULT"/);
  rejected('SELECT * FROM "Default".events', /not "Default"/);
  rejected('SHOW TABLES IN "DEFAULT"', /SHOW TABLES IN default/);
  rejected("SELECT * FROM default.events a JOIN default.events b ON a.type = b.type AND [1, 2] = [1, 2], secrets.keys", /not "secrets"/);
  rejected("SELECT * FROM default.events WHERE a IS DISTINCT FROM b UNION SELECT * FROM secrets.keys", /not "secrets"/);
  // Review round 3.
  rejected("((SELECT 1) UNION SELECT 1 FROM secrets.keys)", /not "secrets"/);
  rejected("WITH x AS ((SELECT 1) UNION SELECT 1 FROM secrets.keys) SELECT * FROM x", /not "secrets"/);
  rejected('SELECT * FROM default.events AS "group" JOIN default.events b ON group.type = b.type, secrets.keys k', /not "secrets"/);
  rejected("SELECT * FROM secrets\u{10400}.keys", /not "secrets./u);
  rejected("SELECT * FROM secrets\u0345.keys", /not "secrets\u0345"/);
  rejected("EXPLAIN (ANALYZE) SHOW TABLES IN secrets", /EXPLAIN works on a query/);
  rejected("EXPLAIN (VERBOSE) DESCRIBE secrets.keys", /EXPLAIN works on a query/);
  rejected("SHOW TABLES IN secrets", /SHOW TABLES IN default/);
  rejected("SHOW ALL", /SHOW TABLES IN default/);
  rejected("DESCRIBE secrets.keys", /not "secrets"/);
  rejected("SELECT $1", /Parameters/);
  rejected("", /no statement/);
  rejected("-- only a comment", /no statement/);
  rejected("SELECT " + "1,".repeat(DEFAULT_LIMITS.maxLength) + "1", /limited/);
});

test("rejections say where", () => {
  try {
    checkQuery("SELECT 1;\nDROP TABLE x");
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof SqlRejected);
    assert.equal(e.at, 10);
  }
});

test("the outermost LIMIT is noticed; a subquery's is not", () => {
  assert.equal(checkQuery("SELECT * FROM default.events LIMIT 10").limited, true);
  assert.equal(checkQuery("SELECT * FROM (SELECT * FROM default.events LIMIT 10) x").limited, false);
  assert.equal(checkQuery("SHOW TABLES IN default").limited, true);
  assert.equal(checkQuery("SELECT type AS limit FROM default.events").limited, false);
  assert.equal(checkQuery("SELECT e.limit FROM default.events e").limited, false);
});

test("statements split on semicolons outside strings and comments; the cursor picks one", () => {
  const text = "SELECT ';' AS a;\n\n-- two\nSELECT 2;\nSELECT 3";
  const list = statements(text);
  assert.deepEqual(list.map((s) => s.text), ["SELECT ';' AS a", "SELECT 2", "SELECT 3"]);
  assert.equal(statementAt(text, 3)?.text, "SELECT ';' AS a");
  assert.equal(statementAt(text, text.indexOf("two"))?.text, "SELECT ';' AS a");
  assert.equal(statementAt(text, text.indexOf("2;") + 2)?.text, "SELECT 2");
  assert.equal(statementAt(text, text.length)?.text, "SELECT 3");
  assert.equal(statementAt("", 0), null);
  // While a string is still open, the block around the cursor.
  assert.equal(statementAt("SELECT 1\n\nSELECT 'open", 12)?.text, "SELECT 'open");
});

const corpus = [
  "with s as (select session_id, max(json_get_str(json_get_json(payload,'data'),'model')) as model from default.model_events where type='model.run-started' group by session_id) select s.model, case when n > 10 then 'big' else 'small' end size, count(*) from s left join e on e.id = s.id and n between 1 and 5 where s.model like '%a  b%' -- keep  this\ngroup by 1, 2 order by 3 desc limit 10",
  "SELECT DISTINCT ON (record_id) record_id, extract(year from occurred_at::timestamp) y, cast(x as int), row_number() over (partition by a order by b) FROM default.events e WHERE NOT EXISTS (SELECT 1 FROM default.events f WHERE f.x = e.x) AND a IS DISTINCT FROM b UNION ALL select 1,2,3,4 from t /* c  d */",
  "select 'multi\nline  string', \"Quoted  Name\", 1.5e-3, -2, arr[1], m['k'] from default.events; show tables in default",
  "SELECT left(type, 3), right(type, 2), first, last, row FROM default.events",
  "SELECT 'a  \nb', 'trailing  ', \"name  \nx\" FROM default.events",
  "SELECT 1 -- comment\n; SELECT 2 -- two\n",
  "SELECT E'hello\\nworld', e'it\\'s', X'ff', N'x', 'plain' FROM default.events",
];

test("formatting changes only whitespace and reserved-word case", () => {
  const essence = (sql: string) =>
    tokenize(sql)
      .filter((t) => t.kind !== "space")
      .map((t) => (t.kind === "word" ? t.text.toLowerCase() : t.kind === "comment" ? t.text.trimEnd() : t.text));
  for (const sql of corpus) {
    const formatted = formatSql(sql);
    assert.deepEqual(essence(formatted), essence(sql), formatted);
    assert.equal(formatSql(formatted), formatted, "formatting is stable");
    assert.equal(statements(formatted).length, statements(sql).length, "statements stay apart");
  }
  // Words that can be column names keep their case.
  assert.match(formatSql(corpus[3]), /left\(type, 3\)/);
  assert.match(formatSql(corpus[3]), / first,/);
  // Strings, including their whitespace, are untouched.
  assert.match(formatSql(corpus[2]), /'multi\nline  string'/);
  assert.equal(formatSql("SELECT 'open"), "SELECT 'open");
  // Golden outputs: compound operators and prefixed literals stay whole.
  assert.equal(formatSql("select 5>>3, 5 << 3, a->>'k', b @> c"), "SELECT\n  5 >> 3,\n  5 << 3,\n  a ->> 'k',\n  b @> c\n");
  assert.equal(formatSql("select U&'d\\0061t', E'x'"), "SELECT\n  U&'d\\0061t',\n  E'x'\n");
  assert.equal(
    formatSql("select type !~~* 'm.%', type !~~ 'x', type ~~* 'y', power(base := 2, exponent := 3)"),
    "SELECT\n  type !~~* 'm.%',\n  type !~~ 'x',\n  type ~~* 'y',\n  power(base := 2, exponent := 3)\n",
  );
  assert.match(formatSql(corpus[4]), /'a  \nb',\n  'trailing  ',\n  "name  \nx"/);
  assert.match(formatSql(corpus[5]), /-- comment\n;/);
  assert.match(formatSql(corpus[6]), /E'hello\\nworld',\n  e'it\\'s',\n  X'ff'/);
  assert.equal(
    formatSql("select a, b from default.events where x = 1 and y = 2"),
    "SELECT\n  a,\n  b\nFROM default.events\nWHERE x = 1\n  AND y = 2\n",
  );
});

test("CSV quotes newlines and commas, keeps Unicode, and defuses formulas", () => {
  const csv = toCsv(
    ["name", "n", "note"],
    [
      ["Zoë, \"the\" 🦊", 1, "two\nlines"],
      ["=HYPERLINK(\"x\")", -5, null],
      ["+1", 0, "@SUM(A1)"],
      ["-2", 3.5, { a: [1] }],
    ],
  );
  assert.ok(csv.startsWith("﻿name,n,note\r\n"));
  assert.match(csv, /"Zoë, ""the"" 🦊",1,"two\nlines"\r\n/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)",-5,\r\n/);
  assert.match(csv, /'\+1,0,'@SUM\(A1\)\r\n/);
  assert.match(csv, /'-2,3.5,"{""a"":\[1\]}"\r\n/);
  assert.equal(defuse("\t=1"), "'\t=1");
  assert.equal(defuse("plain"), "plain");
});

test("JSON keeps nulls and duplicate columns; TSV flattens tabs and newlines", () => {
  assert.deepEqual(JSON.parse(toJson(["a", "a", "b"], [[1, 2, null]])), [{ a: 1, a_2: 2, b: null }]);
  // Generated keys never collide with real column names, in any order.
  assert.deepEqual(uniqueKeys(["x", "x", "x_2"]), ["x", "x_3", "x_2"]);
  assert.deepEqual(uniqueKeys(["x_2", "x", "x", "x"]), ["x_2", "x", "x_3", "x_4"]);
  assert.deepEqual(uniqueKeys(["x", "x", "x", "x_3"]), ["x", "x_2", "x_4", "x_3"]);
  for (const cols of [["x", "x", "x_2"], ["a", "a_2", "a", "a", "a_3"]])
    assert.equal(Object.keys(JSON.parse(toJson(cols, [cols.map((_, i) => i)]))[0]).length, cols.length);
  assert.equal(toTsv(["a", "b"], [["x\ty\nz", null]]), "a\tb\nx y z\t");
});

test("values: structured JSON is recognised, sorting puts nulls last", () => {
  assert.deepEqual(structured('{"data":{"x":1}}'), { data: { x: 1 } });
  assert.equal(structured("{not json"), null);
  assert.equal(structured("plain"), null);
  assert.deepEqual([3, null, "10", 2].sort(compareValues), [2, 3, "10", null]);
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(10_000_000), "10.0 MB");
});

/** A synthetic R2 SQL. SHOW DATABASES lists `namespaces` and is not counted in `calls`. */
function fakeFetch(handler: (body: any) => Response, namespaces: string[] | null = ["default"]) {
  forgetNamespaces();
  const calls: any[] = [];
  const f = (async (url: string, init: RequestInit) => {
    assert.equal(url, SQL_ENDPOINT);
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-token");
    const body = JSON.parse(init.body as string);
    if (body.query === "SHOW DATABASES")
      return namespaces
        ? Response.json({ success: true, result: { schema: [{ name: "namespace" }], rows: namespaces.map((namespace) => ({ namespace })) } })
        : Response.json({ success: false, errors: [{ message: "unsupported" }] }, { status: 400 });
    calls.push(body);
    return handler(body);
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("results are projected, capped and labelled", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ type: `t${i}`, n: i, extra: "never shown" }));
  const { f, calls } = fakeFetch(() =>
    Response.json({
      success: true,
      result: {
        schema: [{ name: "type", type: "Utf8" }, { name: "n", data_type: { Int64: {} } }],
        rows,
        metrics: { bytes_scanned: 1234, files_scanned: 2 },
      },
    }),
  );
  const r = await runQuery("test-token", "SELECT type, n FROM default.events;", { ...DEFAULT_LIMITS, maxRows: 5 }, f);
  assert.equal(calls[0].query, "SELECT type, n FROM default.events");
  assert.deepEqual(r.columns, [{ name: "type", type: "Utf8" }, { name: "n", type: '{"Int64":{}}' }]);
  assert.equal(r.rows.length, 5);
  assert.deepEqual(r.rows[0], ["t0", 0]);
  assert.equal(r.received, 7);
  assert.equal(r.truncated, true);
  assert.equal(r.engineLimit, true);
  assert.deepEqual(r.scan, { bytes: 1234, files: 2 });
  assert.ok(!JSON.stringify(r).includes("never shown"));
});

test("scan figures appear only when the response carries them", async () => {
  const { f } = fakeFetch(() => Response.json({ success: true, result: { schema: [], rows: [] } }));
  const r = await runQuery("test-token", "SELECT 1 LIMIT 1", DEFAULT_LIMITS, f);
  assert.equal(r.scan, null);
  assert.equal(r.engineLimit, false);
  assert.deepEqual(r.rows, []);
});

test("rejected SQL never reaches R2 SQL", async () => {
  const { f, calls } = fakeFetch(() => Response.json({ success: true }));
  await assert.rejects(runQuery("test-token", "DROP TABLE default.events", DEFAULT_LIMITS, f), (e: unknown) =>
    e instanceof QueryFailed && e.failure.kind === "rejected",
  );
  assert.equal(calls.length, 0);
});

test("engine errors come back with their place; credentials and outages are said plainly", async () => {
  const sqlError = fakeFetch(() =>
    Response.json(
      { success: false, errors: [{ code: 40000, message: "sql parser error: Expected: an expression, found: FROM at Line: 2, Column: 8" }] },
      { status: 400 },
    ),
  );
  await assert.rejects(runQuery("test-token", "SELECT\nSELECT FROM x", DEFAULT_LIMITS, sqlError.f), (e: unknown) => {
    assert.ok(e instanceof QueryFailed);
    assert.deepEqual(e.failure, {
      kind: "sql",
      message: "sql parser error: Expected: an expression, found: FROM at Line: 2, Column: 8",
      line: 2,
      column: 8,
    });
    return true;
  });
  const denied = fakeFetch(() => new Response("forbidden", { status: 403 }));
  await assert.rejects(runQuery("test-token", "SELECT 1", DEFAULT_LIMITS, denied.f), /refused the workbench's credential/);
  const down = fakeFetch(() => new Response("<html>private upstream</html>", { status: 502 }));
  await assert.rejects(runQuery("test-token", "SELECT 1", DEFAULT_LIMITS, down.f), (e: unknown) =>
    e instanceof QueryFailed && e.failure.kind === "unavailable" && !e.message.includes("private upstream"),
  );
  assert.deepEqual(errorPlace("no place"), { line: null, column: null });
});

test("a response over the byte limit is dropped, and slow answers time out", async () => {
  const big = fakeFetch(() => Response.json({ success: true, result: { rows: [{ x: "y".repeat(200_000) }] } }));
  await assert.rejects(
    runQuery("test-token", "SELECT 1", { ...DEFAULT_LIMITS, maxBytes: 100_000 }, big.f),
    (e: unknown) => e instanceof QueryFailed && e.failure.kind === "too-large",
  );
  const slow = (async (_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
  // AbortSignal.timeout does not hold the event loop open; this does, for the test.
  const hold = setTimeout(() => {}, 5000);
  await assert.rejects(
    runQuery("test-token", "SELECT 1", { ...DEFAULT_LIMITS, timeoutMs: 50 }, slow),
    (e: unknown) => e instanceof QueryFailed && e.failure.kind === "timeout" && /may still finish/.test(e.message),
  );
  clearTimeout(hold);
});

test("limits come from vars, clamped", () => {
  assert.deepEqual(limitsFrom({}), DEFAULT_LIMITS);
  const l = limitsFrom({ SQL_WORKBENCH_MAX_ROWS: "999999", SQL_WORKBENCH_TIMEOUT_MS: "10", SQL_WORKBENCH_MAX_BYTES: "nope" });
  assert.equal(l.maxRows, 50000);
  assert.equal(l.timeoutMs, 1000);
  assert.equal(l.maxBytes, DEFAULT_LIMITS.maxBytes);
});

test("the schema is listed and described from metadata", async () => {
  const { f, calls } = fakeFetch((body) => {
    if (body.query === "SHOW TABLES IN default")
      return Response.json({
        success: true,
        result: {
          schema: [{ name: "namespace" }, { name: "table_name" }],
          rows: [
            { namespace: "default", table_name: "events" },
            { namespace: "default", table_name: "model_events" },
            { namespace: "default", table_name: "bad name; drop" },
          ],
        },
      });
    if (body.query === "DESCRIBE default.events")
      return Response.json({
        success: true,
        result: {
          schema: [{ name: "column_name" }, { name: "type" }, { name: "required" }, { name: "doc" }],
          rows: [
            { column_name: "record_id", type: "string", required: true, doc: null },
            { column_name: "elapsed_ms", type: "double", required: false, doc: "" },
          ],
        },
      });
    return Response.json({ success: false, errors: [{ message: "boom" }] }, { status: 400 });
  });
  const schema = await readSchema("test-token", DEFAULT_LIMITS, f);
  assert.deepEqual(calls.map((c) => c.query), ["SHOW TABLES IN default", "DESCRIBE default.events", "DESCRIBE default.model_events"]);
  assert.deepEqual(schema.tables, [
    {
      namespace: "default",
      name: "events",
      columns: [
        { name: "record_id", type: "string", required: true, doc: null },
        { name: "elapsed_ms", type: "double", required: false, doc: null },
      ],
    },
  ]);
  assert.deepEqual(schema.failed, ["model_events"]);
});

test("a schema read has one query in flight at a time", async () => {
  let open = 0;
  let most = 0;
  const f = (async (_url: string, init: RequestInit) => {
    open++;
    most = Math.max(most, open);
    await new Promise((r) => setTimeout(r, 5));
    open--;
    const { query } = JSON.parse(init.body as string);
    return query.startsWith("SHOW")
      ? Response.json({ success: true, result: { schema: [{ name: "table_name" }], rows: ["a", "b", "c", "d", "e", "f"].map((t) => ({ table_name: t })) } })
      : Response.json({ success: true, result: { schema: [{ name: "column_name" }, { name: "type" }], rows: [{ column_name: "x", type: "int" }] } });
  }) as unknown as typeof fetch;
  const schema = await readSchema("test-token", DEFAULT_LIMITS, f);
  assert.equal(schema.tables.length, 6);
  assert.equal(most, 1);
});

test("no query names another namespace of the bucket, however it is written", async () => {
  const names = ["secrets", "Other"];
  for (const sql of [
    "SELECT * FROM secrets.keys",
    "((SELECT 1) UNION SELECT 1 FROM secrets.keys)",
    'SELECT * FROM "SECRETS".keys',
    "SELECT * FROM (secrets.keys k CROSS JOIN default.events e)",
    "SELECT * FROM other.t",
    "SELECT 'secrets' AS s",
  ])
    assert.ok(mentionedNamespace(sql, names), sql);
  for (const sql of ["SELECT * FROM default.events", "SELECT secrets_count, my_secrets FROM default.events", "SELECT * FROM secrets\u{10400}.keys"])
    assert.equal(mentionedNamespace(sql, names), null, sql);
  // Through runQuery: refused before anything but the namespace list is read.
  const { f, calls } = fakeFetch(() => Response.json({ success: true, result: { rows: [] } }), ["default", "secrets"]);
  await assert.rejects(runQuery("test-token", "((SELECT 1) UNION SELECT 1 FROM secrets.keys)", DEFAULT_LIMITS, f), /another namespace|not "secrets"/);
  await assert.rejects(runQuery("test-token", "SELECT 1 AS secrets FROM default.events", DEFAULT_LIMITS, f), (e: unknown) =>
    e instanceof QueryFailed && e.failure.kind === "rejected" && /another namespace/.test(e.message),
  );
  assert.equal(calls.length, 0);
  await runQuery("test-token", "SELECT type FROM default.events LIMIT 1", DEFAULT_LIMITS, f);
  assert.equal(calls.length, 1);
});

test("when the namespaces cannot be listed, nothing runs", async () => {
  const { f, calls } = fakeFetch(() => Response.json({ success: true, result: { rows: [] } }), null);
  await assert.rejects(runQuery("test-token", "SELECT 1", DEFAULT_LIMITS, f), (e: unknown) =>
    e instanceof QueryFailed && e.failure.kind === "unavailable" && /fails closed/.test(e.message),
  );
  assert.equal(calls.length, 0);
});
