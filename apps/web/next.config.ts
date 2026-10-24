import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  // Comma-separated hosts allowed to load dev resources, e.g. a LAN IP.
  allowedDevOrigins:
    process.env.ALLOWED_DEV_ORIGINS?.split(",").filter(Boolean),
  // Always defined, so builds without the demo catalog drop it at compile time.
  env: { DEMO_CATALOG: process.env.DEMO_CATALOG ?? "" },
};
export default config;
