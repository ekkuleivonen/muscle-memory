/**
 * ESM bridge to the CommonJS domain contracts. Under tsx, Node 22 does not
 * expose named exports when an ES module imports a CommonJS .ts file, so load
 * the domain through require. Remove this once the workspace shares one module type.
 */
import { createRequire } from "node:module";

const domain = createRequire(import.meta.url)(
  "../domain/assessment",
) as typeof import("../domain/assessment");

export const { assess, canonical, encounter, snapshot } = domain;
export type {
  Adventure,
  Attempt,
  Challenge,
  Encounter,
  Json,
} from "../domain/assessment";
