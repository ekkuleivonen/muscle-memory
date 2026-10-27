/** The wasm-bindgen glue of @guanmingchiu/sqlparser-ts, aliased in next.config.ts. */
declare module "sqlparser-wasm-glue" {
  export function initSync(options: { module: WebAssembly.Module }): unknown;
  export function parse_sql(dialect: string, sql: string): unknown;
}
