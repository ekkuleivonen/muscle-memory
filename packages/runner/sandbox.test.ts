import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BOOT_SCRIPT, BOOT_SCRIPT_HASH, sandboxDocument } from "./sandbox";

test("the pinned boot script hash matches the script", () => {
  const actual =
    "sha256-" + createHash("sha256").update(BOOT_SCRIPT).digest("base64");
  assert.equal(BOOT_SCRIPT_HASH, actual);
  assert.ok(sandboxDocument().includes(`script-src '${actual}'`));
});
