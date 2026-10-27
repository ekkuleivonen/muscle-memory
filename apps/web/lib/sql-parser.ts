import "server-only";
import type { SqlParse } from "../../../packages/workbench/check";
// The package's wasm-bindgen glue, aliased in next.config.ts: its exports map hides it.
import { initSync, parse_sql } from "sqlparser-wasm-glue";

/** Absolute path of the parser's .wasm, with `?module`; defined in next.config.ts. */
declare const __SQLPARSER_WASM__: string;

let ready: Promise<void> | null = null;

/**
 * R2 SQL's own parser (datafusion-sqlparser-rs, generic dialect) as WebAssembly, for the
 * workbench's read-only check. Workers cannot compile WebAssembly at run time, so the module
 * is bundled precompiled (`?module`, resolved by OpenNext and wrangler); `next dev` in Node
 * compiles it from the file.
 */
export async function sqlParser(): Promise<SqlParse> {
  ready ??= (async () => {
    const path = __SQLPARSER_WASM__;
    const module =
      process.env.NODE_ENV === "development"
        ? new WebAssembly.Module(
            await (await import(/* webpackIgnore: true */ "node:fs/promises")).readFile(path.replace(/\?module$/, "")),
          )
        : ((await import(/* webpackIgnore: true */ path)) as { default: WebAssembly.Module }).default;
    initSync({ module });
  })();
  try {
    await ready;
  } catch (cause) {
    ready = null;
    throw cause;
  }
  return (sql) => parse_sql("generic", sql) as unknown[];
}
