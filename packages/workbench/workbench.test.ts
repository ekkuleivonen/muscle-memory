import { test } from "node:test";
import assert from "node:assert/strict";
import { init, parse } from "@guanmingchiu/sqlparser-ts";
import { checkQuery, SqlRejected, type SqlParse } from "./check";
import { statementAt, statements, tokenize } from "./sql";
import { formatSql } from "./format";
import { compareValues, defuse, formatBytes, structured, toCsv, toJson, toTsv, uniqueKeys } from "./export";
import {
  DEFAULT_LIMITS,
  errorPlace,
  limitsFrom,
  QueryFailed,
  readSchema,
  runQuery,
  SQL_ENDPOINT,
} from "./read";

// R2 SQL's own parser, as the server uses it (apps/web/lib/sql-parser.ts loads the same WebAssembly).
await init();
const parseSql: SqlParse = (sql) => parse(sql, "generic") as unknown[];
const check = (sql: string) => checkQuery(sql, parseSql);

function rejected(sql: string, pattern?: RegExp) {
  assert.throws(
    () => check(sql),
    (e: unknown) => e instanceof SqlRejected && (!pattern || pattern.test(e.message)),
    sql,
  );
}

test("reads are accepted: joins, CTEs, subqueries, literals, comments and aliases of any spelling", () => {
  const ok = [
    "SELECT 1",
    "select * from default.events limit 10;",
    "  -- recent\nSELECT type FROM default.events /* note; with a semicolon */ LIMIT 5  ;  \n",
    "WITH s AS (SELECT session_id FROM default.model_events), e AS (SELECT * FROM default.events) SELECT * FROM s JOIN e ON e.session_id = s.session_id",
    "SELECT EXTRACT(YEAR FROM t.occurred_at) FROM default.events t",
    "SELECT a IS DISTINCT FROM b, a IS NOT DISTINCT FROM b FROM default.events",
    "SELECT substring((type) FROM 1 FOR 2), trim(BOTH 'x' FROM type) FROM default.events",
    "SELECT ';DROP TABLE x;' AS s, 'it''s' AS t, E'it\\'s' AS u, X'ff' AS v FROM default.events",
    'SELECT "update", "select", e.distinct, e.group FROM default.events e',
    "SELECT * FROM default.events a, default.model_events b, (SELECT 1) c WHERE a.x = b.x",
    "SELECT * FROM default.events a LEFT JOIN default.model_events b ON a.x = b.x AND a.y IN (1, 2) AND [1, 2] = [1, 2], default.model_catalog c",
    "SELECT * FROM (default.events e JOIN default.model_events m ON e.session_id = m.session_id)",
    "SELECT * FROM ((SELECT 1 AS x) a JOIN (SELECT 1 AS x) b ON a.x = b.x)",
    "SELECT * FROM DEFAULT.events",
    'SELECT * FROM "default".events',
    "(SELECT 1) UNION ALL (SELECT 2)",
    "SELECT 1 UNION SELECT type FROM default.events INTERSECT SELECT type FROM default.model_events",
    "SELECT ROW_NUMBER() OVER (PARTITION BY type ORDER BY occurred_at) AS n FROM default.events QUALIFY n = 1",
    "SELECT count(*) FROM default.events GROUP BY GROUPING SETS ((type), ())",
    "SELECT x FROM default.events WHERE x IN (SELECT y FROM default.model_events) AND EXISTS (SELECT 1 FROM default.events)",
    "SELECT (SELECT max(occurred_at) FROM default.events) AS latest",
    "SELECT DISTINCT ON (record_id) record_id, json_get_str(json_get_json(payload, 'data'), 'status') FROM default.events",
    "SELECT 5 >> 3, type !~~* 'm.%', power(2, 3), occurred_at::timestamp FROM default.events",
    "VALUES (1, 'a'), (2, 'b')",
    "WITH t(n, select, from) AS (VALUES (1, 2, 3)) SELECT * FROM t",
    // Spelled like another namespace, in a string, a comment, an alias or a column: all fine.
    "SELECT 'secrets.keys' AS secrets, other FROM default.events AS secrets -- secrets.keys",
    "SHOW DATABASES",
    "SHOW TABLES IN default",
    "DESCRIBE default.events",
    "EXPLAIN SELECT count(*) FROM default.events",
    "EXPLAIN ANALYZE SELECT count(*) FROM default.events",
    "EXPLAIN VERBOSE WITH x AS (SELECT 1) SELECT * FROM x",
  ];
  for (const sql of ok) assert.doesNotThrow(() => check(sql), sql);
  assert.equal(check("select 1;").sql, "select 1");
  assert.equal(check("select 1 ; ;\n").sql, "select 1");
});

test("writes, other namespaces, table functions and several statements are refused, in any form", () => {
  for (const sql of [
    "INSERT INTO default.events VALUES (1)",
    "UPDATE default.events SET x = 1",
    "DELETE FROM default.events",
    "DROP TABLE default.events",
    "CREATE TABLE x AS SELECT 1",
    "ALTER TABLE default.events ADD COLUMN x int",
    "TRUNCATE default.events",
    "SET datafusion.execution.batch_size = 1",
    "COPY (SELECT 1) TO 's3://x'",
    "EXPLAIN DELETE FROM default.events",
    "EXPLAIN DESCRIBE secrets.keys",
    "EXPLAIN (ANALYZE) SHOW TABLES IN secrets",
  ])
    rejected(sql);
  rejected("SELECT * INTO copy FROM default.events", /SELECT INTO/);
  rejected("WITH x AS (DELETE FROM default.events) SELECT * FROM x", /not DELETE/);
  rejected("SELECT 1; DROP TABLE default.events", /one statement/);
  rejected("SELECT 1; SELECT 2", /one statement/);
  rejected("SELECT 1 -- ;\n; DELETE FROM x", /one statement/);
  rejected("SELECT 'unterminated");
  rejected("SELECT 1 /* open");
  // Other namespaces: every form the reviews found, now read by the engine's own parser.
  for (const sql of [
    "SELECT * FROM secrets.keys",
    "SELECT * FROM other.events",
    'SELECT * FROM "Other".events',
    'SELECT * FROM "DEFAULT".events',
    "SELECT * FROM default.events JOIN secrets.keys ON 1 = 1",
    "SELECT * FROM default.events e, secrets.keys k",
    "SELECT * FROM default.events a JOIN default.events b ON a.x = b.x, secrets.keys",
    "SELECT * FROM (SELECT * FROM secrets.keys) k",
    "SELECT * FROM (secrets.keys k CROSS JOIN default.events e)",
    "SELECT * FROM (default.events e JOIN (secrets.keys k JOIN default.events f ON 1 = 1) ON 1 = 1)",
    "SELECT * FROM ((secrets.keys))",
    "SELECT e.distinct FROM secrets.keys e",
    'WITH t AS (SELECT 1 AS "group") SELECT * FROM t a JOIN t b ON a."group" = b.group, secrets.keys k',
    "((SELECT 1) UNION SELECT 1 FROM secrets.keys)",
    "WITH x AS ((SELECT 1) UNION SELECT 1 FROM secrets.keys) SELECT * FROM x",
    'SELECT * FROM default.events AS "group" JOIN default.events b ON group.type = b.type, secrets.keys k',
    "SELECT * FROM default.events WHERE x IN (SELECT k FROM secrets.keys)",
    "SELECT (SELECT max(k) FROM secrets.keys)",
    "SELECT * FROM default.events WHERE a IS DISTINCT FROM b UNION SELECT * FROM secrets.keys",
    "EXPLAIN ANALYZE SELECT * FROM secrets.keys",
    // Round 4: an alias named like a clause, and a quoted name with an escaped quote.
    "SELECT * FROM default.events AS limit, secrets.keys",
    'SELECT * FROM default.events AS limit, "a""b".keys',
  ])
    rejected(sql, /"default" namespace/);
  rejected("SELECT * FROM catalog.default.events", /namespace\.table at most/);
  rejected("SELECT * FROM read_parquet('s3://bucket/x')", /Table functions/);
  rejected("SELECT * FROM UNNEST([1, 2])", /UNNEST is not available/);
  rejected("SHOW TABLES IN secrets", /SHOW TABLES IN default/);
  // Round 5: rows from functions outside table positions, and loose SHOW forms.
  rejected("SELECT * FROM default.events |> CALL read_parquet('x')", /Pipe syntax/);
  rejected("SELECT * FROM default.events LATERAL VIEW read_parquet('x') t AS x", /LATERAL VIEW/);
  rejected("SHOW TABLES IN ACCOUNT default", /SHOW TABLES IN default/);
  rejected("SHOW TERSE TABLES IN default", /SHOW TABLES IN default/);
  rejected("SHOW DATABASES IN secrets", /SHOW DATABASES on its own/);
  rejected("DESCRIBE secrets.keys", /not "secrets"/);
  rejected("", /no statement/);
  rejected("-- only a comment", /no statement/);
  rejected("SELECT " + "1,".repeat(DEFAULT_LIMITS.maxLength) + "1", /limited/);
});

test("refusals and parse errors say where", () => {
  for (const [sql, at] of [
    ["SELECT 1;\nDROP TABLE x", 10],
    ["SELECT *\nFROM secrets.keys", 14],
    ["SELECT (1\n  FROM x", 12],
    // Columns count code points: after two emoji (four UTF-16 units) FROM is at offset 18.
    ["SELECT '\u{1F600}\u{1F600}', (1 FROM default.events", 18],
    ["SELECT 1,\n  '\u{1F600}', (1 FROM x", 21],
  ] as const) {
    try {
      check(sql);
      assert.fail(sql);
    } catch (e) {
      assert.ok(e instanceof SqlRejected, String(e));
      assert.ok(e.at !== null && e.at >= at && e.at <= at + (sql.includes("\u{1F600}") ? 0 : 4), `${sql}: ${e.at} (${e.message})`);
    }
  }
});

test("the outermost LIMIT is noticed; a subquery's or an alias is not", () => {
  assert.equal(check("SELECT * FROM default.events LIMIT 10").limited, true);
  assert.equal(check("SELECT * FROM (SELECT * FROM default.events LIMIT 10) x").limited, false);
  assert.equal(check('SELECT type AS "limit" FROM default.events').limited, false);
  assert.equal(check("WITH limit AS (SELECT * FROM default.events) SELECT * FROM limit").limited, false);
  assert.equal(check("SELECT limit FROM default.events").limited, false);
  assert.equal(check("SHOW TABLES IN default").limited, true);
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

function fakeFetch(handler: (body: any) => Response) {
  const calls: any[] = [];
  const f = (async (url: string, init: RequestInit) => {
    assert.equal(url, SQL_ENDPOINT);
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-token");
    const body = JSON.parse(init.body as string);
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
  const r = await runQuery("test-token", "SELECT type, n FROM default.events;", parseSql, { ...DEFAULT_LIMITS, maxRows: 5 }, f);
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
  const r = await runQuery("test-token", "SELECT 1 LIMIT 1", parseSql, DEFAULT_LIMITS, f);
  assert.equal(r.scan, null);
  assert.equal(r.engineLimit, false);
  assert.deepEqual(r.rows, []);
});

test("rejected SQL never reaches R2 SQL", async () => {
  const { f, calls } = fakeFetch(() => Response.json({ success: true }));
  for (const sql of ["SELECT * FROM default.events |> CALL read_parquet('x')", "SELECT * FROM default.events LATERAL VIEW read_parquet('x') t AS x"])
    await assert.rejects(runQuery("test-token", sql, parseSql, DEFAULT_LIMITS, f), (e: unknown) => e instanceof QueryFailed && e.failure.kind === "rejected");
  await assert.rejects(runQuery("test-token", "DROP TABLE default.events", parseSql, DEFAULT_LIMITS, f), (e: unknown) =>
    e instanceof QueryFailed && e.failure.kind === "rejected",
  );
  assert.equal(calls.length, 0);
});

test("engine errors come back with their place; credentials and outages are said plainly", async () => {
  const sqlError = fakeFetch(() =>
    Response.json(
      { success: false, errors: [{ code: 40000, message: "Schema error: No field named nope at Line: 2, Column: 3" }] },
      { status: 400 },
    ),
  );
  await assert.rejects(runQuery("test-token", "SELECT\n  nope FROM default.events", parseSql, DEFAULT_LIMITS, sqlError.f), (e: unknown) => {
    assert.ok(e instanceof QueryFailed);
    assert.deepEqual(e.failure, {
      kind: "sql",
      message: "Schema error: No field named nope at Line: 2, Column: 3",
      line: 2,
      column: 3,
    });
    return true;
  });
  const denied = fakeFetch(() => new Response("forbidden", { status: 403 }));
  await assert.rejects(runQuery("test-token", "SELECT 1", parseSql, DEFAULT_LIMITS, denied.f), /refused the workbench's credential/);
  const down = fakeFetch(() => new Response("<html>private upstream</html>", { status: 502 }));
  await assert.rejects(runQuery("test-token", "SELECT 1", parseSql, DEFAULT_LIMITS, down.f), (e: unknown) =>
    e instanceof QueryFailed && e.failure.kind === "unavailable" && !e.message.includes("private upstream"),
  );
  assert.deepEqual(errorPlace("no place"), { line: null, column: null });
});

test("a response over the byte limit is dropped, and slow answers time out", async () => {
  const big = fakeFetch(() => Response.json({ success: true, result: { rows: [{ x: "y".repeat(200_000) }] } }));
  await assert.rejects(
    runQuery("test-token", "SELECT 1", parseSql, { ...DEFAULT_LIMITS, maxBytes: 100_000 }, big.f),
    (e: unknown) => e instanceof QueryFailed && e.failure.kind === "too-large",
  );
  const slow = (async (_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
  // AbortSignal.timeout does not hold the event loop open; this does, for the test.
  const hold = setTimeout(() => {}, 5000);
  await assert.rejects(
    runQuery("test-token", "SELECT 1", parseSql, { ...DEFAULT_LIMITS, timeoutMs: 50 }, slow),
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

