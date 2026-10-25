/**
 * Later challenges, in files by theme so several authors can add challenges at once without
 * touching content/seed.ts. Each is a complete SeedIssue: entry point and starter included,
 * with a private reference solution for the publish checks.
 */
import type { SeedIssue } from "../seed";
import { issues as accountsApi } from "./accounts-api";
import { issues as dataPlatform } from "./data-platform";
import { issues as edgeProxy } from "./edge-proxy";
import { issues as fieldNotes } from "./field-notes";
import { issues as incidentResponse } from "./incident-response";
import { issues as storefront } from "./storefront";

export const MORE: SeedIssue[] = [
  ...fieldNotes,
  ...storefront,
  ...accountsApi,
  ...dataPlatform,
  ...edgeProxy,
  ...incidentResponse,
];
