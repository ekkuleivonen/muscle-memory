import { test } from "node:test";
import assert from "node:assert/strict";
import { randomId } from "./random-id";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("random ids are UUID v4, with or without crypto.randomUUID", () => {
  assert.match(randomId(), UUID);
  // Insecure contexts (http over the LAN) have no randomUUID; shadow the prototype's.
  Object.defineProperty(crypto, "randomUUID", {
    value: undefined,
    configurable: true,
  });
  try {
    const ids = new Set(Array.from({ length: 50 }, randomId));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, UUID);
  } finally {
    delete (crypto as { randomUUID?: unknown }).randomUUID;
  }
  assert.equal(typeof crypto.randomUUID, "function");
});
