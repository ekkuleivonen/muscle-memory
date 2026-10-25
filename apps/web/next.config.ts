import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
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
