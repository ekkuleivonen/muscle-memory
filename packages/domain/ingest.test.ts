import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256, sha256Hex } from "./ingest";

test("the SHA-256 fallback matches Web Crypto", async () => {
  for (const text of ["", "abc", "é".repeat(1000), "x".repeat(55), "x".repeat(56), "x".repeat(64)]) {
    const bytes = new TextEncoder().encode(text);
    const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    assert.deepEqual([...sha256(bytes)], [...expected], `length ${bytes.length}`);
  }
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
