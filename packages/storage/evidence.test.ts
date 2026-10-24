import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEvidenceStore } from "./evidence-sqlite";
import {
  exportPending,
  removeArchivedEvent,
  syncDirectory,
  writeEvent,
} from "./export";
import { deleteParticipant } from "./deletion";
import { referenceSubmission } from "./reference-fixture";
import {
  captureSubmission,
  CAPTURE_LIMIT_BYTES,
  MAX_OBSERVATION_ID_LENGTH,
} from "../domain/evidence";
import {
  fixtureEvaluator,
  projectAssessment,
  type Evaluator,
} from "../domain/projection";
import { canonical, type Challenge } from "../domain/assessment";

async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "muscle-memory-evidence-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const MALFORMED = '[{"a": 2,';
const VALID = ' [{"a":2,"b":1}, {},\n {"A":2,"a":1}, {"__proto__":2,"x":1}]\n';

test("malformed submission survives reopen and export with a parse-failure projection", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEvidenceStore(database);
    // Evidence and its outbox commit before any parsing happens.
    store.capture(captureSubmission(referenceSubmission(MALFORMED)));
    store.close();

    store = new SqliteEvidenceStore(database);
    try {
      const evidence = store.evidence("synthetic-submission-1");
      assert.equal(evidence.submission.text, MALFORMED);
      store.appendProjection(await projectAssessment(evidence));
      assert.equal(await exportPending(store, archive), 5);
      const exported = JSON.parse(
        await readFile(
          join(archive, "synthetic-submission-1.submission.json"),
          "utf8",
        ),
      );
      assert.equal(exported.text, MALFORMED);
      const [projection] = store.projections("synthetic-submission-1");
      assert.deepEqual(projection.outcome, {
        status: "parse-failed",
        message: "Enter a valid JSON array.",
      });
      assert.deepEqual(projection.evaluator, {
        id: "fixture-json-compare",
        version: "1.0.0",
      });
      assert.deepEqual((await readdir(archive)).sort(), [
        "adventure.field-notes.1.0.0.json",
        "challenge.frequency-map.1.0.0.json",
        `${projection.projectionId}.json`,
        "synthetic-submission-1.json",
        "synthetic-submission-1.submission.json",
      ]);
    } finally {
      store.close();
    }
  }));

test("unsupported scoring keeps evidence; a later evaluator appends a separate projection", async () =>
  temporary(async (root) => {
    const input = referenceSubmission(VALID);
    // A synthetic future formula that the current evaluator does not implement.
    const challenge: Challenge = {
      ...input.challenge,
      version: "1.1.0-synthetic",
      assessment_version: "2.0.0",
    };
    const adventure = {
      ...input.adventure,
      version: "1.1.0-synthetic",
      challenges: [[challenge.id, challenge.version] as const],
    };
    const captured = captureSubmission({
      ...input,
      adventure,
      challenge,
      encounter: {
        ...input.encounter,
        adventureVersion: adventure.version,
        challengeOrder: adventure.challenges,
      },
    });
    const store = new SqliteEvidenceStore(join(root, "evidence.sqlite"));
    try {
      store.capture(captured);
      const before = canonical(
        store.evidence("synthetic-submission-1") as never,
      );
      store.appendProjection(
        await projectAssessment(store.evidence("synthetic-submission-1")),
      );
      const later: Evaluator = {
        id: "fixture-json-compare",
        version: "2.0.0",
        environment: { id: "pure-typescript-no-execution", version: "1.0.0" },
        supports: (version) => version === "2.0.0",
        assess: (content, attempt) => ({
          passed: attempt.outputs.map(
            (value, index) =>
              canonical(value) === canonical(content.expected[index]),
          ),
        }),
      };
      store.appendProjection(
        await projectAssessment(
          store.evidence("synthetic-submission-1"),
          later,
        ),
      );
      // Projections are ordered by ID, not creation time; select by evaluator version.
      const stored = store.projections("synthetic-submission-1");
      assert.equal(stored.length, 2);
      const first = stored.find((p) => p.evaluator.version === "1.0.0")!;
      const second = stored.find((p) => p.evaluator.version === "2.0.0")!;
      assert.deepEqual(first.outcome, {
        status: "unsupported",
        assessmentVersion: "2.0.0",
      });
      assert.equal(second.evaluator.version, "2.0.0");
      assert.deepEqual(second.outcome, {
        status: "assessed",
        assessment: { passed: [true, true, true, true] },
      });
      assert.deepEqual(second.observationIds, first.observationIds);
      assert.deepEqual(second.artifactIds, first.artifactIds);
      // Reassessment appended; evidence is byte-identical and whitespace survives.
      assert.equal(
        canonical(store.evidence("synthetic-submission-1") as never),
        before,
      );
      assert.equal(
        store.evidence("synthetic-submission-1").submission.text,
        VALID,
      );
      // Recomputing the same evaluator version reproduces the same record.
      assert.equal(
        store.appendProjection(
          await projectAssessment(
            store.evidence("synthetic-submission-1"),
            later,
          ),
        ).duplicate,
        true,
      );
    } finally {
      store.close();
    }
  }));

test("identical retry deduplicates, conflicting ID fails atomically, write-before-ack keeps one archive", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEvidenceStore(database);
    const captured = captureSubmission(referenceSubmission(VALID));
    assert.equal(store.capture(captured).duplicate, false);
    assert.equal(store.capture(captured).duplicate, true);
    assert.throws(
      () => store.capture(captureSubmission(referenceSubmission(VALID + " "))),
      /different content/,
    );
    assert.equal(
      store.evidence("synthetic-submission-1").submission.text,
      VALID,
    );
    assert.equal(store.pending().length, 4);
    let writes = 0;
    await assert.rejects(
      exportPending(store, archive, async (...args) => {
        await writeEvent(...args);
        if (++writes === 1)
          throw new Error("Simulated crash after write before acknowledgment");
      }),
      /Simulated crash/,
    );
    store.close();
    store = new SqliteEvidenceStore(database);
    try {
      assert.equal(store.pending().length, 4);
      assert.equal(await exportPending(store, archive), 4);
      assert.equal(await exportPending(store, archive), 0);
      assert.equal((await readdir(archive)).length, 4);
    } finally {
      store.close();
    }
  }));

test("truncated submission keeps a leading BOM through capture, reopen and export", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    const archive = join(root, "exports");
    const text = "\uFEFF" + "a".repeat(CAPTURE_LIMIT_BYTES);
    let store = new SqliteEvidenceStore(database);
    store.capture(captureSubmission(referenceSubmission(text)));
    store.close();
    store = new SqliteEvidenceStore(database);
    try {
      const { submission, observation } = store.evidence(
        "synthetic-submission-1",
      );
      assert.deepEqual(submission.capture, {
        captureVersion: "synthetic-submission-capture-1.0.0",
        limitBytes: CAPTURE_LIMIT_BYTES,
        originalBytes: CAPTURE_LIMIT_BYTES + 3,
        capturedBytes: CAPTURE_LIMIT_BYTES,
        truncated: true,
      });
      // The exact byte prefix: BOM (3 bytes) plus 65533 "a".
      assert.equal(submission.text, text.slice(0, CAPTURE_LIMIT_BYTES - 2));
      assert.ok(observation.captureGaps.includes("submission-truncated"));
      assert.equal(await exportPending(store, archive), 4);
      const exported = JSON.parse(
        await readFile(
          join(archive, "synthetic-submission-1.submission.json"),
          "utf8",
        ),
      );
      assert.equal(exported.text, submission.text);
      assert.equal(
        new TextEncoder().encode(exported.text).length,
        CAPTURE_LIMIT_BYTES,
      );
    } finally {
      store.close();
    }
  }));

test("environment-only reassessment appends; same environment deduplicates", async () =>
  temporary(async (root) => {
    const store = new SqliteEvidenceStore(join(root, "evidence.sqlite"));
    try {
      store.capture(captureSubmission(referenceSubmission(VALID)));
      const before = canonical(
        store.evidence("synthetic-submission-1") as never,
      );
      const first = await projectAssessment(
        store.evidence("synthetic-submission-1"),
      );
      store.appendProjection(first);
      assert.equal(
        store.appendProjection(
          await projectAssessment(store.evidence("synthetic-submission-1")),
        ).duplicate,
        true,
      );
      const moved = await projectAssessment(
        store.evidence("synthetic-submission-1"),
        {
          ...fixtureEvaluator,
          environment: { ...fixtureEvaluator.environment, version: "2.0.0" },
        },
      );
      assert.notEqual(moved.projectionId, first.projectionId);
      assert.equal(store.appendProjection(moved).duplicate, false);
      const stored = store.projections("synthetic-submission-1");
      assert.equal(stored.length, 2);
      // The evaluator is unchanged; only the environment differs, and the earlier result stays.
      const earlier = stored.find(
        (p) => p.projectionId === first.projectionId,
      )!;
      const later = stored.find((p) => p.projectionId === moved.projectionId)!;
      assert.equal(canonical(earlier as never), canonical(first as never));
      assert.deepEqual(later.evaluator, earlier.evaluator);
      assert.deepEqual(later.environment, {
        id: "pure-typescript-no-execution",
        version: "2.0.0",
      });
      assert.equal(
        canonical(store.evidence("synthetic-submission-1") as never),
        before,
      );
      // Identity stays bounded even with the longest allowed observation ID.
      const longId = "o".repeat(MAX_OBSERVATION_ID_LENGTH);
      store.capture(
        captureSubmission(referenceSubmission(VALID, undefined, longId, 2)),
      );
      const long = await projectAssessment(store.evidence(longId));
      assert.ok(long.projectionId.length <= 128);
      assert.throws(
        () =>
          captureSubmission(
            referenceSubmission(VALID, undefined, longId + "o"),
          ),
        /at most 64/,
      );
    } finally {
      store.close();
    }
  }));

const A = "synthetic-participant-a";
const B = "synthetic-participant-b";

test("participant deletion removes owned evidence and projections, keeps shared content, and retries after sync failure", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEvidenceStore(database);
    for (const [participant, id, text, sequence] of [
      [A, "a-malformed", MALFORMED, 1],
      [A, "a-valid", VALID, 2],
      [B, "b-valid", VALID, 1],
    ] as const) {
      store.capture(
        captureSubmission(referenceSubmission(text, participant, id, sequence)),
      );
      store.appendProjection(await projectAssessment(store.evidence(id)));
    }
    assert.equal(await exportPending(store, archive), 11);
    // A pending, unexported projection for A must also be deleted.
    store.appendProjection(
      await projectAssessment(store.evidence("a-valid"), {
        ...fixtureEvaluator,
        version: "1.0.1",
      }),
    );
    // Unlink succeeds but the directory sync fails: nothing may be recorded as removed.
    const failed = await deleteParticipant(store, A, archive, (directory, id) =>
      removeArchivedEvent(directory, id, async () => {
        throw new Error("EIO: simulated directory sync failure");
      }),
    );
    assert.equal(failed.complete, false);
    assert.equal(failed.remainingFiles.length, 7);
    assert.throws(
      () =>
        store.capture(
          captureSubmission(referenceSubmission(VALID, A, "a-valid")),
        ),
      /deleted locally/,
    );
    assert.throws(
      () =>
        store.capture(
          captureSubmission(referenceSubmission(VALID, B, "a-valid", 2)),
        ),
      /awaiting archive deletion/,
    );
    store.close();

    store = new SqliteEvidenceStore(database);
    try {
      const synced: string[] = [];
      const retried = await deleteParticipant(
        store,
        A,
        archive,
        (directory, id) =>
          removeArchivedEvent(directory, id, async (path) => {
            synced.push(path);
            await syncDirectory(path);
          }),
      );
      assert.equal(retried.complete, true);
      assert.equal(synced.length, 7);
      // Export after deletion cannot resurrect A, and its projection cannot be re-appended.
      assert.equal(await exportPending(store, archive), 0);
      assert.throws(
        () =>
          store.appendProjection({
            ...store.projections("b-valid")[0],
            participantId: A,
          }),
        /deleted locally/,
      );
      assert.deepEqual((await readdir(archive)).sort(), [
        "adventure.field-notes.1.0.0.json",
        `${store.projections("b-valid")[0].projectionId}.json`,
        "b-valid.json",
        "b-valid.submission.json",
        "challenge.frequency-map.1.0.0.json",
      ]);
      assert.equal(store.evidence("b-valid").submission.text, VALID);
      assert.ok(store.get("challenge.frequency-map.1.0.0"));
      for (const id of [
        "a-valid",
        "a-valid.submission",
        "a-malformed.submission",
      ])
        assert.equal(store.get(id), undefined);
      // Shared records hold published content only, never submission text.
      for (const name of [
        "adventure.field-notes.1.0.0.json",
        "challenge.frequency-map.1.0.0.json",
      ])
        assert.ok(
          !(await readFile(join(archive, name), "utf8")).includes(
            "synthetic-participant",
          ),
        );
      assert.equal((await deleteParticipant(store, A, archive)).complete, true);
    } finally {
      store.close();
    }
  }));
