import { PRELUDE } from "./shared";

/**
 * SQL on PGlite, Postgres compiled to WebAssembly, so queries behave like the Postgres used at
 * work. Every case runs in its own transaction that is rolled back afterwards: the issue's
 * schema is created, the case's rows are inserted, then the solution's statements run. The
 * last statement that returns rows is the case's output, as an array of rows.
 */
export const SQL_WORKER =
  PRELUDE +
  String.raw`
let db = null;

async function boot(assets) {
  self.fetch = async () => {
    throw new TypeError("Network access is disabled.");
  };
  const url = URL.createObjectURL(new Blob([assets["pglite.js"]], { type: "text/javascript" }));
  const { PGlite } = await import(url);
  db = await PGlite.create({
    pgliteWasmModule: await WebAssembly.compile(assets["pglite.wasm"]),
    initdbWasmModule: await WebAssembly.compile(assets["initdb.wasm"]),
    fsBundle: new Blob([assets["pglite.data"]]),
    // numeric arrives as text by default; the expected rows hold JSON numbers.
    parsers: { 1700: (value) => Number(value) },
  });
}

/** Postgres errors the way psql prints them, with a caret under the position. */
function sqlError(error, code, filename) {
  const message = String(error && error.message || error);
  let text = "ERROR:  " + message + "\n";
  const position = Number(error && error.position);
  if (Number.isInteger(position) && position > 0) {
    const before = code.slice(0, position - 1);
    const line = before.split("\n").length;
    const column = before.length - before.lastIndexOf("\n");
    const source = code.split("\n")[line - 1];
    const prefix = "LINE " + line + ": ";
    text += prefix + source + "\n" + " ".repeat(prefix.length + column - 1) + "^\n";
    text += "  at " + filename + ":" + line + ":" + column + "\n";
  }
  if (error && error.hint) text += "HINT:  " + error.hint + "\n";
  return {
    type: error && error.code ? "SQLSTATE " + error.code : "Error",
    message: message.slice(0, 2000),
    traceback: bounded(text),
  };
}

async function columnsOf(table) {
  const result = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function fixtures(input) {
  for (const [table, rows] of Object.entries(input || {})) {
    const columns = await columnsOf(table);
    if (!columns.length) throw new Error("The schema has no table named " + table + ".");
    for (const row of rows) {
      const names = columns.slice(0, row.length).map((name) => '"' + name + '"');
      const params = row.map((_, i) => "$" + (i + 1));
      await db.query(
        'INSERT INTO "' + table + '" (' + names.join(", ") + ") VALUES (" + params.join(", ") + ")",
        row,
      );
    }
  }
}

function rowsOf(results) {
  const returning = results.filter((result) => result.fields.length > 0);
  const last = returning[returning.length - 1];
  return last ? last.rows : [];
}

async function execute({ code, inputs, setup, filename }) {
  const tests = [];
  for (const [index, input] of inputs.entries()) {
    await db.exec("BEGIN");
    try {
      try {
        if (setup) await db.exec(setup);
        await fixtures(input);
      } catch (error) {
        throw new Error("The test fixtures could not be loaded: " + (error && error.message));
      }
      let results;
      try {
        results = await db.exec(code, { rowMode: "array" });
      } catch (error) {
        // A syntax error fails every case the same way; show it once, like a compile error.
        if (index === 0 && error && error.code === "42601")
          return { phase: "compile", error: sqlError(error, code, filename), tests: [] };
        tests.push({ index, error: sqlError(error, code, filename) });
        continue;
      }
      tests.push({ index, ...convert(rowsOf(results)) });
    } finally {
      await db.exec("ROLLBACK").catch(() => undefined);
    }
  }
  return { phase: "tests", tests };
}
`;
