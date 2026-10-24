import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  // Comma-separated hosts allowed to load dev resources, e.g. a LAN IP.
  allowedDevOrigins:
    process.env.ALLOWED_DEV_ORIGINS?.split(",").filter(Boolean),
};
export default config;
