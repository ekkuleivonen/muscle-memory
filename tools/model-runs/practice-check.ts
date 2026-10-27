/**
 * Checks headless practice with a scripted player instead of a model: on every challenge (or
 * the keys given), run the examples on the starter, submit the starter (it must fail), write
 * the reference solution and submit it (it must complete). The practice stream it records must
 * be a person's in shape, with `actor: "model"`: contiguous positions, one session, the same
 * envelope fields, and every edit, run and verdict where practice records them.
 *
 *   node --import tsx tools/model-runs/practice-check.ts            every challenge
 *   node --import tsx tools/model-runs/practice-check.ts PY-001 TS-002
 */
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { revisionId } from "../../packages/content/revision";
import { readChallenges } from "../../packages/content/source";
import { modelParticipant } from "../../packages/domain/model";
import { MODEL_PRACTICE_CAPTURE_GAPS, PRACTICE_CAPTURE_GAPS, PRACTICE_CAPTURE_VERSION } from "../../packages/domain/practice";
import { PracticeHost, runClock } from "./practice";
import { edited, opening, ran } from "./render";

const root = resolve(import.meta.dirname, "../..");
const only = process.argv.slice(2);
const challenges = readChallenges(join(root, "content/challenges")).filter(
  (c) => !only.length || only.includes(c.metadata.key),
);
if (only.length && challenges.length !== only.length)
  throw new Error(`unknown challenge key among ${only.join(", ")}`);

const ENVELOPE = [
  "actor", "assignments", "attemptId", "captureVersion", "challenge", "challengeRevision", "data",
  "elapsedMs", "observationId", "occurredAt", "participantId", "schemaVersion", "sessionId",
  "source", "termsVersion", "type",
];

const host = await PracticeHost.start();
const failures: string[] = [];
for (const { metadata: source, revision, private: secret } of challenges) {
  const metadata = { ...source, revision: revisionId(revision) };
  const key = metadata.key;
  const runId = `check-${key.toLowerCase()}`;
  try {
    const practice = await host.open({
      key,
      revisionId: metadata.revision,
      revision,
      participantId: modelParticipant("scripted/reference"),
      sessionId: `run-${runId}`,
      sourceId: `practice-${runId}`,
      attemptId: `attempt-${runId}`,
      origin: runClock(),
      editor: { name: "model-harness", features: ["whole-file-view"] },
      captureGaps: [...PRACTICE_CAPTURE_GAPS, ...MODEL_PRACTICE_CAPTURE_GAPS],
    });
    const { runtimeLabel, typeChecked } = practice.opened;
    assert.match(opening(metadata, revision, runtimeLabel, typeChecked), /## Goal and requirements/);
    const examples = await practice.run("examples");
    assert.equal(examples.run.purpose, "examples");
    assert.ok(examples.practice, "a run records something");
    const starter = await practice.run("submit");
    assert.equal(starter.completed, false, "the starter does not complete");
    const failing = ran(starter, revision, runtimeLabel);
    assert.ok(failing.length > 0, "a submission says something");
    const missing = await practice.edit("\u0000 not in the file", "x");
    assert.equal(missing.applied, false);
    assert.equal(missing.practice, null, "an edit that changes nothing records nothing");
    const written = await practice.write(secret.solution);
    assert.equal(written.code, secret.solution);
    assert.ok(written.practice, "an edit is recorded");
    if (typeChecked) assert.ok(Array.isArray(written.diagnostics));
    edited(written, revision.file, null);
    const solved = await practice.run("submit");
    assert.equal(solved.completed, true, `the solution completes: ${ran(solved, revision, runtimeLabel)} ${JSON.stringify(solved.run.verdict)} ${JSON.stringify(solved.run.outcome).slice(0, 600)}`);
    assert.equal(ran(solved, revision, runtimeLabel).split("\n")[0], "Done.");
    await practice.close();
    assert.deepEqual(practice.pageErrors, []);

    const observations = practice.records
      .filter((r) => r.kind === "observation")
      .map((r) => JSON.parse(r.payload))
      .sort((a, b) => a.source.sequence - b.source.sequence);
    assert.deepEqual(
      observations.map((o) => o.source.sequence),
      observations.map((_, i) => i + 1),
      "positions are contiguous from 1",
    );
    for (const o of observations) {
      assert.deepEqual(Object.keys(o).sort(), ENVELOPE);
      assert.equal(o.actor, "model");
      assert.equal(o.termsVersion, null);
      assert.equal(o.captureVersion, PRACTICE_CAPTURE_VERSION);
      assert.equal(o.sessionId, `run-${runId}`);
      assert.equal(o.challengeRevision, metadata.revision);
      assert.ok(o.elapsedMs >= 0, `${o.type} at ${o.elapsedMs} ms`);
    }
    const types = observations.map((o) => o.type);
    assert.equal(types[0], "practice.started");
    assert.equal(observations[0].data.from, "model-run");
    assert.equal(types[1], "practice.opened");
    assert.equal(types.at(-1), "practice.closed");
    assert.equal(observations.at(-1).data.reason, "run-ended");
    const edits = observations.filter((o) => o.type === "practice.edit");
    assert.equal(edits.length, 1);
    assert.equal(edits[0].data.userEvent, "model.write");
    const submitted = observations.filter((o) => o.type === "practice.submitted");
    assert.deepEqual(
      submitted.map((o) => o.data.result === "passed" && !o.data.rules.length),
      [false, true],
    );
    assert.equal(types.filter((t) => t === "practice.completed").length, 1);
    assert.ok(
      observations
        .filter((o) => o.type === "practice.run")
        .every((o) => o.data.via === "tool"),
      "runs are started by tool calls",
    );
    assert.ok(
      !types.some((t) => /practice\.(keys|selection|scroll|focus|clipboard|page)/.test(t)),
      `only what a model does is recorded: ${[...new Set(types)].join(", ")}`,
    );
    console.log(
      `ok   ${key}: ${observations.length} observations, starter ${starter.run.verdict?.passed}/${starter.run.verdict?.total}, solution completes`,
    );
  } catch (error) {
    failures.push(`FAIL ${key}: ${(error as Error).message}`);
  }
}
await host.stop();
for (const failure of failures) console.log(failure);
process.exit(failures.length ? 1 : 0);
