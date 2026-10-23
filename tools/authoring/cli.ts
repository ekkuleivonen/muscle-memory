/**
 * Local authoring CLI for the versioned content catalog. Synthetic data only;
 * no network, hosting or submitted-code execution.
 *
 *   node --import tsx tools/authoring/cli.ts <command> [arguments] [--catalog <file>]
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessAttempt,
  disable,
  findEntry,
  markTested,
  preview,
  publish,
  retire,
  saveDraft,
  startAttempt,
  type Catalog,
  type ContentKind,
  type ContentRef,
} from "../../packages/catalog/catalog";
import { loadCatalog, saveCatalog } from "../../packages/catalog/file-store";
import { snapshot, type Attempt } from "../../packages/catalog/domain";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const defaultCatalog = "private/authoring/catalog.json";
const defaultDemoDirectory = "private/authoring-demo";

const usage = `Usage: node --import tsx tools/authoring/cli.ts <command> [--catalog ${defaultCatalog}]

  draft <adventure|challenge> <manifest.json>    create or edit a draft
  preview <kind> <id> <version>                  validate source and pinned references
  test <kind> <id> <version>                     run fixture validation for this exact snapshot
  publish <kind> <id> <version>                  freeze this id/version
  retire <kind> <id> <version>                   stop new attempts; in-flight attempts still complete
  disable <kind> <id> <version> <reason...>      stop new and in-flight attempts immediately
  list                                           show every version and state
  history <kind> <id> <version>                  show transition history
  can-start <adventure-id> <version> [position]  check attempt eligibility
  demo [directory]                               walk the reference content through the lifecycle`;

function parseKind(value: string | undefined): ContentKind {
  if (value !== "adventure" && value !== "challenge")
    throw new Error("Kind must be adventure or challenge.");
  return value;
}

function parseRef(args: string[]): ContentRef {
  const [kind, id, version] = args;
  if (!id || !version) throw new Error("Give <kind> <id> <version>.");
  return { kind: parseKind(kind), id, version };
}

async function readManifest(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

function list(catalog: Catalog): void {
  for (const entry of Object.values(catalog.entries)) {
    console.log(
      `${entry.kind.padEnd(9)} ${`${entry.id}@${entry.version}`.padEnd(28)} ${entry.state.padEnd(9)} ${entry.digest.slice(0, 12)}`,
    );
  }
}

async function run(args: string[]): Promise<void> {
  const catalogFlag = args.indexOf("--catalog");
  const catalogPath = resolve(
    catalogFlag >= 0 ? args.splice(catalogFlag, 2)[1] : defaultCatalog,
  );
  const [command, ...rest] = args;
  if (command === "demo") return demo(resolve(rest[0] ?? defaultDemoDirectory));

  const catalog = await loadCatalog(catalogPath);
  const save = async (next: Catalog, message: string) => {
    await saveCatalog(catalogPath, next);
    console.log(message);
  };
  switch (command) {
    case "draft": {
      const kind = parseKind(rest[0]);
      if (!rest[1]) throw new Error("Give a manifest file.");
      const next = saveDraft(catalog, kind, await readManifest(rest[1]));
      return save(next, next === catalog ? "No changes." : "Draft saved.");
    }
    case "preview":
      return save(preview(catalog, parseRef(rest)), "Preview valid.");
    case "test":
      return save(
        markTested(catalog, parseRef(rest)),
        "Fixtures pass; marked tested.",
      );
    case "publish":
      return save(publish(catalog, parseRef(rest)), "Published and frozen.");
    case "retire":
      return save(retire(catalog, parseRef(rest)), "Retired.");
    case "disable":
      return save(
        disable(catalog, parseRef(rest), rest.slice(3).join(" ")),
        "Disabled.",
      );
    case "list":
      return list(catalog);
    case "history": {
      const entry = findEntry(catalog, parseRef(rest));
      if (!entry) throw new Error("Unknown content version.");
      for (const step of entry.history)
        console.log(
          `${step.at} ${step.action.padEnd(9)} ${String(step.from ?? "-").padEnd(9)} → ${step.to.padEnd(9)} ${step.digest.slice(0, 12)} ${step.note ?? ""}`,
        );
      return;
    }
    case "can-start": {
      const [id, version, position = "0"] = rest;
      if (!id || !version) throw new Error("Give <adventure-id> <version>.");
      const started = startAttempt(catalog, id, version, Number(position));
      console.log(
        `Can start ${started.challenge.id}@${started.challenge.version} in ${id}@${version}.`,
      );
      return;
    }
    default:
      console.log(usage);
      if (command && command !== "help") process.exitCode = 1;
  }
}

/** Shows that an operation is rejected, with its message. */
function rejected(label: string, operation: () => unknown): void {
  try {
    operation();
  } catch (error) {
    console.log(`  ✗ ${label}: ${(error as Error).message}`);
    return;
  }
  throw new Error(`Expected rejection: ${label}`);
}

async function demo(directory: string): Promise<void> {
  const catalogPath = resolve(directory, "catalog.json");
  let catalog = await loadCatalog(catalogPath);
  const challengeRef = {
    kind: "challenge",
    id: "frequency-map",
    version: "1.0.0",
  } as const;
  const adventureRef = {
    kind: "adventure",
    id: "field-notes",
    version: "1.0.0",
  } as const;
  const challenge = await readManifest(
    resolve(repositoryRoot, "content/challenges/frequency-map.v1.json"),
  );
  const adventure = await readManifest(
    resolve(repositoryRoot, "content/adventures/field-notes.v1.json"),
  );

  if (Object.keys(catalog.entries).length > 0) {
    console.log(`Reloaded ${catalogPath} after restart:`);
    list(catalog);
    rejected("changing frozen frequency-map@1.0.0", () =>
      saveDraft(catalog, "challenge", {
        ...(challenge as object),
        task: "Changed",
      }),
    );
    rejected("starting retired field-notes@1.0.0", () =>
      startAttempt(catalog, "field-notes", "1.0.0"),
    );
    console.log("Delete this directory to rerun the full walkthrough.");
    return;
  }

  const step = async (message: string, next: Catalog) => {
    catalog = next;
    await saveCatalog(catalogPath, catalog);
    console.log(`  ✓ ${message}`);
  };
  console.log(`Synthetic authoring catalog: ${catalogPath}`);

  console.log("1. Draft, preview, test and publish the reference content");
  rejected("drafting field-notes before its Challenge exists", () =>
    saveDraft(catalog, "adventure", adventure),
  );
  await step(
    "drafted frequency-map@1.0.0",
    saveDraft(catalog, "challenge", challenge),
  );
  await step("previewed frequency-map@1.0.0", preview(catalog, challengeRef));
  await step("tested frequency-map@1.0.0", markTested(catalog, challengeRef));
  await step(
    "drafted field-notes@1.0.0",
    saveDraft(catalog, "adventure", adventure),
  );
  await step("previewed field-notes@1.0.0", preview(catalog, adventureRef));
  rejected("testing field-notes before its Challenge is published", () =>
    markTested(catalog, adventureRef),
  );
  await step("published frequency-map@1.0.0", publish(catalog, challengeRef));
  await step("tested field-notes@1.0.0", markTested(catalog, adventureRef));
  await step("published field-notes@1.0.0", publish(catalog, adventureRef));

  console.log("2. Published content is frozen; drafts invalidate testing");
  rejected("changing frozen frequency-map@1.0.0", () =>
    saveDraft(catalog, "challenge", {
      ...(challenge as object),
      task: "Changed",
    }),
  );
  const nextRef = { ...challengeRef, version: "1.1.0" };
  const nextVersion = { ...(challenge as object), version: "1.1.0" };
  await step(
    "drafted frequency-map@1.1.0",
    saveDraft(catalog, "challenge", nextVersion),
  );
  await step("previewed frequency-map@1.1.0", preview(catalog, nextRef));
  await step("tested frequency-map@1.1.0", markTested(catalog, nextRef));
  await step(
    "edited frequency-map@1.1.0 draft; test result cleared",
    saveDraft(catalog, "challenge", {
      ...nextVersion,
      hints: ["Count each label once per item."],
    }),
  );
  rejected("publishing the edited 1.1.0 draft", () =>
    publish(catalog, nextRef),
  );

  console.log("3. Attempt eligibility, retirement and disable");
  const started = startAttempt(catalog, "field-notes", "1.0.0");
  console.log(
    `  ✓ field-notes@1.0.0 can start ${started.challenge.id}@${started.challenge.version}`,
  );
  const attempt: Attempt = {
    id: "synthetic-authoring-1",
    participantId: "synthetic-participant-1",
    challengeId: started.challenge.id,
    challengeVersion: started.challenge.version,
    challengeSnapshot: snapshot(started.challenge),
    encounter: started.encounter,
    outputs: started.challenge.expected,
    assistance: "unaided",
    hintsShown: [],
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    submittedAt: new Date().toISOString(),
    activeSeconds: null,
    consentVersion: "synthetic-demo-v1",
  };
  console.log("  ✓ synthetic attempt started (in flight)");
  await step("retired field-notes@1.0.0", retire(catalog, adventureRef));
  rejected("starting retired field-notes@1.0.0", () =>
    startAttempt(catalog, "field-notes", "1.0.0"),
  );
  const result = assessAttempt(catalog, attempt);
  console.log(
    `  ✓ in-flight attempt still completes after retirement: ${result.feedback}`,
  );
  await step(
    "disabled frequency-map@1.0.0",
    disable(catalog, challengeRef, "synthetic demo: fixture problem found"),
  );
  rejected("assessing the in-flight attempt after disable", () =>
    assessAttempt(catalog, attempt),
  );
  console.log("4. Old versions and history are kept");
  list(catalog);
  console.log("Run the demo again to reload this catalog after a restart.");
}

run(process.argv.slice(2)).catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
