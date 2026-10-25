/**
 * Later issues by project id, one file per project, so several authors can add issues at once
 * without touching content/seed.ts. Each issue is a complete SeedIssue: entry point and starter
 * included, with a private reference solution for the publish checks.
 */
import type { SeedIssue } from "../seed";
import { issues as accountsApi } from "./accounts-api";
import { issues as dataPlatform } from "./data-platform";
import { issues as edgeProxy } from "./edge-proxy";
import { issues as fieldNotes } from "./field-notes";
import { issues as storefront } from "./storefront";

export const MORE: Record<string, SeedIssue[]> = {
  "field-notes": fieldNotes,
  storefront,
  "accounts-api": accountsApi,
  "data-platform": dataPlatform,
  "edge-proxy": edgeProxy,
};
