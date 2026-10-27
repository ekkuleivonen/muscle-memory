import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// R2 SQL's parser for the SQL workbench's check (apps/web/lib/sql-parser.ts). Its glue is
// aliased (the package's exports map hides it) and its .wasm is imported by absolute path with
// `?module`, which OpenNext leaves to wrangler to bundle as a precompiled module.
const sqlparser = join(
  dirname(createRequire(import.meta.url).resolve("@guanmingchiu/sqlparser-ts")),
  "../wasm",
);

const config: NextConfig = {
  reactStrictMode: true,
  webpack(config, { webpack }) {
    config.resolve.alias["sqlparser-wasm-glue$"] = join(sqlparser, "sqlparser_rs_wasm.js");
    config.plugins.push(
      new webpack.DefinePlugin({
        __SQLPARSER_WASM__: JSON.stringify(join(sqlparser, "sqlparser_rs_wasm_bg.wasm") + "?module"),
      }),
    );
    return config;
  },
  // Comma-separated hosts allowed to load dev resources, e.g. a LAN IP.
  allowedDevOrigins:
    process.env.ALLOWED_DEV_ORIGINS?.split(",").filter(Boolean),
  // Plain HTTP to production goes to HTTPS: Cloudflare says which scheme the visitor used.
  // Local dev (localhost) is untouched.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          { type: "host", value: "musclememory.run" },
          { type: "header", key: "x-forwarded-proto", value: "http" },
        ],
        destination: "https://musclememory.run/:path*",
        permanent: true,
      },
    ];
  },
  // HTTPS only, remembered for a year. Browsers ignore it over plain HTTP.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};
export default config;
