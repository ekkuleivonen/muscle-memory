import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { currentCatalog } from "../../apps/web/app/current-catalog";
import { startAttempt, assessAttempt } from "./gates";
import { retire, disable, verifyCatalog } from "./catalog";
import { referenceEvent } from "../storage/reference-fixture";

test("the app refreshes read-only content before start/assessment and honors changed eligibility", async () => {
  let published = verifyCatalog(
    JSON.parse(
      await readFile(
        new URL("../../content/catalog/reference.v1.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  let requests = 0;
  const fetchCatalog = (async (url, options) => {
    assert.equal(url, "/api/catalog");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.body, undefined); // Answers and participant IDs are never sent.
    requests++;
    return Response.json(published);
  }) as typeof fetch;
  const event = referenceEvent();
  const first = await currentCatalog(fetchCatalog);
  const active = startAttempt(first, "field-notes", "1.0.0");
  assert.equal(active.challenge.id, event.attempt.challengeId);
  assert.equal(assessAttempt(first, event.attempt).correctness, 1);

  published = retire(published, {
    kind: "adventure",
    id: "field-notes",
    version: "1.0.0",
  });
  const retired = await currentCatalog(fetchCatalog);
  assert.throws(() => startAttempt(retired, "field-notes", "1.0.0"), /retired/);
  assert.equal(assessAttempt(retired, event.attempt).correctness, 1);

  published = disable(
    published,
    { kind: "challenge", id: "frequency-map", version: "1.0.0" },
    "Synthetic disable check",
  );
  const disabled = await currentCatalog(fetchCatalog);
  assert.throws(() => assessAttempt(disabled, event.attempt), /disabled/);
  assert.equal(requests, 3);
});
