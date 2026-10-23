import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessAttempt,
  disable,
  emptyCatalog,
  findEntry,
  markTested,
  preview,
  publish,
  retire,
  saveDraft,
  startAttempt,
  type Catalog,
  type ContentRef,
} from "./catalog";
import { loadCatalog, saveCatalog } from "./file-store";
import {
  snapshot,
  type Adventure,
  type Attempt,
  type Challenge,
} from "./domain";

const at = "2026-01-01T00:00:00Z";
const challenge: Challenge = {
  id: "tally",
  version: "1.0.0",
  assessment_version: "1.0.0",
  task: "Count labels",
  skills: ["maps"],
  hints: ["Use a map"],
  inputs: [["a"], []],
  expected: [{ a: 1 }, {}],
};
const adventure: Adventure = {
  id: "notebook",
  version: "1.0.0",
  story: "Count field notes",
  presentation: "text-v1",
  challenges: [["tally", "1.0.0"]],
};
const challengeRef: ContentRef = {
  kind: "challenge",
  id: "tally",
  version: "1.0.0",
};
const adventureRef: ContentRef = {
  kind: "adventure",
  id: "notebook",
  version: "1.0.0",
};

function release(catalog: Catalog, ref: ContentRef): Catalog {
  return publish(markTested(preview(catalog, ref, at), ref, at), ref, at);
}

function publishedReference(): Catalog {
  let catalog = release(
    saveDraft(emptyCatalog(), "challenge", challenge, at),
    challengeRef,
  );
  catalog = release(
    saveDraft(catalog, "adventure", adventure, at),
    adventureRef,
  );
  return catalog;
}

function inFlightAttempt(catalog: Catalog): Attempt {
  const started = startAttempt(catalog, "notebook", "1.0.0");
  return {
    id: "synthetic-attempt-1",
    participantId: "synthetic-participant-1",
    challengeId: started.challenge.id,
    challengeVersion: started.challenge.version,
    challengeSnapshot: snapshot(started.challenge),
    encounter: started.encounter,
    outputs: [{ a: 1 }, { wrong: 1 }],
    assistance: "unaided",
    hintsShown: [],
    startedAt: at,
    submittedAt: "2026-01-01T00:01:00Z",
    activeSeconds: null,
    consentVersion: "synthetic-v1",
  };
}

test("lifecycle rejects invalid transitions", () => {
  const draft = saveDraft(emptyCatalog(), "challenge", challenge, at);
  assert.throws(() => publish(draft, challengeRef, at), /published from draft/);
  assert.throws(() => markTested(draft, challengeRef, at), /tested from draft/);
  assert.throws(() => retire(draft, challengeRef, at), /retired from draft/);
  assert.throws(
    () => disable(draft, challengeRef, "bad", at),
    /disabled from draft/,
  );
  const previewed = preview(draft, challengeRef, at);
  assert.throws(
    () => preview(previewed, challengeRef, at),
    /previewed from preview/,
  );
  const published = release(draft, challengeRef);
  assert.throws(() => disable(published, challengeRef, " ", at), /reason/);
  const disabled = disable(published, challengeRef, "fixture leak", at);
  assert.throws(
    () => retire(disabled, challengeRef, at),
    /retired from disabled/,
  );
  assert.deepEqual(
    findEntry(disabled, challengeRef)!.history.map((step) => step.action),
    ["drafted", "previewed", "tested", "published", "disabled"],
  );
  assert.equal(
    findEntry(disabled, challengeRef)!.history.at(-1)!.note,
    "fixture leak",
  );
});

test("testing needs passing fixtures and draft edits invalidate it", () => {
  const unsupported = saveDraft(
    emptyCatalog(),
    "challenge",
    { ...challenge, assessment_version: "9.0.0" },
    at,
  );
  assert.throws(
    () => markTested(preview(unsupported, challengeRef, at), challengeRef, at),
    /Unsupported assessment version/,
  );

  const tested = markTested(
    preview(
      saveDraft(emptyCatalog(), "challenge", challenge, at),
      challengeRef,
      at,
    ),
    challengeRef,
    at,
  );
  assert.equal(findEntry(tested, challengeRef)!.testResult!.fixtures, 2);
  const edited = saveDraft(
    tested,
    "challenge",
    { ...challenge, task: "Count every label" },
    at,
  );
  const entry = findEntry(edited, challengeRef)!;
  assert.equal(entry.state, "draft");
  assert.equal(entry.testResult, null);
  assert.equal(entry.history.at(-1)!.action, "edited");
  assert.throws(
    () => publish(edited, challengeRef, at),
    /published from draft/,
  );
  // Re-saving identical content is a no-op, not an edit.
  assert.equal(saveDraft(tested, "challenge", challenge, at), tested);
});

test("Adventure references must exist for preview and be published for publication", () => {
  assert.throws(
    () => saveDraft(emptyCatalog(), "adventure", adventure, at),
    /Missing Challenge tally@1.0.0/,
  );
  let catalog = saveDraft(emptyCatalog(), "challenge", challenge, at);
  catalog = saveDraft(catalog, "adventure", adventure, at);
  catalog = preview(catalog, adventureRef, at);
  assert.throws(
    () => markTested(catalog, adventureRef, at),
    /tally@1.0.0 which is draft; publish that Challenge first/,
  );
  catalog = release(catalog, challengeRef);
  catalog = publish(markTested(catalog, adventureRef, at), adventureRef, at);
  assert.equal(findEntry(catalog, adventureRef)!.state, "published");

  // A disabled Challenge cannot be referenced by new Adventure content.
  const disabled = disable(catalog, challengeRef, "broken fixture", at);
  assert.throws(
    () =>
      saveDraft(disabled, "adventure", { ...adventure, version: "1.1.0" }, at),
    /Missing Challenge/,
  );
  const retired = retire(catalog, challengeRef, at);
  const next = saveDraft(
    retired,
    "adventure",
    { ...adventure, version: "1.1.0" },
    at,
  );
  const nextRef = { ...adventureRef, version: "1.1.0" };
  assert.throws(() => release(next, nextRef), /tally@1.0.0 which is retired/);
});

test("Adventure test results cannot go stale through a changing Challenge dependency", () => {
  let catalog = saveDraft(emptyCatalog(), "challenge", challenge, at);
  catalog = markTested(preview(catalog, challengeRef, at), challengeRef, at);
  catalog = preview(
    saveDraft(catalog, "adventure", adventure, at),
    adventureRef,
    at,
  );
  // A tested but unpublished Challenge can still change under the same version.
  assert.throws(
    () => markTested(catalog, adventureRef, at),
    /tally@1.0.0 which is tested; publish that Challenge first/,
  );
  catalog = saveDraft(
    catalog,
    "challenge",
    { ...challenge, task: "Changed" },
    at,
  );
  catalog = release(catalog, challengeRef);
  assert.throws(
    () => publish(catalog, adventureRef, at),
    /published from preview/,
  );
  // Testing now covers the frozen Challenge content that will be published.
  catalog = publish(markTested(catalog, adventureRef, at), adventureRef, at);
  assert.equal(findEntry(catalog, adventureRef)!.state, "published");
  assert.equal(
    (startAttempt(catalog, "notebook", "1.0.0").challenge as Challenge).task,
    "Changed",
  );
});

test("assessment rejects an encounter that differs from the Adventure snapshot", () => {
  let catalog = release(
    saveDraft(emptyCatalog(), "challenge", challenge, at),
    challengeRef,
  );
  const other = { ...challenge, id: "sort", task: "Sort labels" };
  const otherRef = { ...challengeRef, id: "sort" };
  catalog = release(saveDraft(catalog, "challenge", other, at), otherRef);
  const twoStep = {
    ...adventure,
    challenges: [
      ["tally", "1.0.0"],
      ["sort", "1.0.0"],
    ] as const,
  };
  catalog = release(saveDraft(catalog, "adventure", twoStep, at), adventureRef);
  const attempt = inFlightAttempt(catalog);
  const withClue = {
    ...attempt,
    encounter: {
      ...attempt.encounter,
      cluesShown: ["The notebook is sorted."],
    },
  };
  assert.equal(assessAttempt(catalog, withClue).correctness, 0.5);
  const altered: Attempt[] = [
    {
      ...attempt,
      encounter: { ...attempt.encounter, presentation: "other-v1" },
    },
    {
      ...attempt,
      encounter: {
        ...attempt.encounter,
        challengeOrder: [
          ["sort", "1.0.0"],
          ["tally", "1.0.0"],
        ],
        position: 1,
      },
    },
    {
      ...attempt,
      encounter: { ...attempt.encounter, challengeOrder: [["tally", "1.0.0"]] },
    },
    { ...attempt, encounter: { ...attempt.encounter, position: 1 } },
    { ...attempt, encounter: { ...attempt.encounter, position: 0.5 } },
  ];
  for (const candidate of altered)
    assert.throws(
      () => assessAttempt(catalog, candidate),
      /Encounter does not match Adventure notebook@1.0.0/,
    );
});

test("published content is frozen; changes need a new version and old versions remain", () => {
  const catalog = publishedReference();
  assert.throws(
    () =>
      saveDraft(catalog, "challenge", { ...challenge, hints: ["Changed"] }, at),
    /published and frozen. Create a new version/,
  );
  assert.equal(saveDraft(catalog, "challenge", challenge, at), catalog);
  const manifest = { ...challenge, version: "2.0.0", hints: ["Changed"] };
  const v2Ref = { ...challengeRef, version: "2.0.0" };
  const v2 = release(saveDraft(catalog, "challenge", manifest, at), v2Ref);
  manifest.task = "mutated by caller";
  assert.equal(
    (findEntry(v2, v2Ref)!.content as Challenge).task,
    challenge.task,
  );
  assert.deepEqual(findEntry(v2, challengeRef)!.content, challenge);
  assert.equal(findEntry(v2, challengeRef)!.state, "published");
  assert.equal(findEntry(v2, v2Ref)!.state, "published");
});

test("retirement blocks new starts but completes in-flight attempts; disable blocks both", () => {
  const catalog = publishedReference();
  const attempt = inFlightAttempt(catalog);
  assert.equal(assessAttempt(catalog, attempt).correctness, 0.5);

  const retired = retire(catalog, adventureRef, at);
  assert.throws(() => startAttempt(retired, "notebook", "1.0.0"), /is retired/);
  assert.equal(assessAttempt(retired, attempt).correctness, 0.5);
  assert.deepEqual(findEntry(retired, adventureRef)!.content, adventure);

  const challengeRetired = retire(catalog, challengeRef, at);
  assert.throws(
    () => startAttempt(challengeRetired, "notebook", "1.0.0"),
    /Challenge tally@1.0.0 is retired/,
  );
  assert.equal(assessAttempt(challengeRetired, attempt).correctness, 0.5);

  const disabled = disable(retired, adventureRef, "story spoiler", at);
  assert.throws(
    () => assessAttempt(disabled, attempt),
    /is disabled; this attempt cannot be assessed/,
  );
  assert.deepEqual(findEntry(disabled, adventureRef)!.content, adventure);

  const challengeDisabled = disable(catalog, challengeRef, "fixture leak", at);
  assert.throws(
    () => startAttempt(challengeDisabled, "notebook", "1.0.0"),
    /is disabled/,
  );
  assert.throws(
    () => assessAttempt(challengeDisabled, attempt),
    /Challenge tally@1.0.0 is disabled/,
  );
});

test("catalog reload preserves state, history and frozen content", async () => {
  const root = await mkdtemp(join(tmpdir(), "muscle-memory-catalog-"));
  try {
    const path = join(root, "catalog.json");
    assert.deepEqual(await loadCatalog(path), emptyCatalog());
    const catalog = retire(publishedReference(), adventureRef, at);
    await saveCatalog(path, catalog);
    const reloaded = await loadCatalog(path);
    assert.deepEqual(reloaded, catalog);
    assert.throws(
      () =>
        saveDraft(reloaded, "challenge", { ...challenge, task: "Changed" }, at),
      /frozen/,
    );
    assert.throws(
      () => startAttempt(reloaded, "notebook", "1.0.0"),
      /is retired/,
    );

    // A hand edit to published content is detected on reload.
    const tampered = JSON.parse(await readFile(path, "utf8"));
    tampered.entries["challenge:tally@1.0.0"].content.task = "Changed";
    await writeFile(path, JSON.stringify(tampered));
    await assert.rejects(loadCatalog(path), /does not match its digest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
