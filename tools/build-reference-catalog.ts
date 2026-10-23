/** Deterministic reference release fixture, authored through the actual lifecycle. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  emptyCatalog,
  saveDraft,
  preview,
  markTested,
  publish,
  verifyCatalog,
  type ContentRef,
} from "../packages/catalog/catalog";

const root = resolve("content");
const challenge = JSON.parse(
  await readFile(resolve(root, "challenges/frequency-map.v1.json"), "utf8"),
);
const adventure = JSON.parse(
  await readFile(resolve(root, "adventures/field-notes.v1.json"), "utf8"),
);
const at = "2026-10-23T00:00:00.000Z"; // Synthetic reference-release timestamp; deterministic across builds.
let catalog = emptyCatalog();
for (const [kind, content] of [
  ["challenge", challenge],
  ["adventure", adventure],
] as const) {
  const ref: ContentRef = { kind, id: content.id, version: content.version };
  catalog = saveDraft(catalog, kind, content, at);
  catalog = publish(markTested(preview(catalog, ref, at), ref, at), ref, at);
}
verifyCatalog(catalog);
const destination = resolve(root, "catalog/reference.v1.json");
const text = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== text)
    throw new Error(
      "Reference catalog differs from authored content. Regenerate it before building.",
    );
  console.log("Reference catalog is published, pinned and current.");
} else {
  await mkdir(resolve(root, "catalog"), { recursive: true });
  await writeFile(destination, text);
}
