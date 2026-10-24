import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../../packages/catalog/catalog";
import { selectChallenge } from "./select";

const catalog = JSON.parse(
  readFileSync(
    new URL("../../../../content/catalog/reference.v1.json", import.meta.url),
    "utf8",
  ),
) as Catalog;

test("opens the named runnable Challenge, or the default without a name", () => {
  const named = selectChallenge(catalog, "frequency-map@2.0.0");
  assert.equal(named.ok && named.challenge.version, "2.0.0");
  const fallback = selectChallenge(catalog, null);
  assert.equal(fallback.ok && fallback.challenge.version, "2.1.0");
});

test("refuses malformed, unpublished and non-runnable Challenges", () => {
  const message = (param: string) => {
    const result = selectChallenge(catalog, param);
    return result.ok ? "ok" : result.message;
  };
  assert.match(message("frequency-map"), /named like/);
  assert.match(message("frequency-map@9.0.0"), /not a published/);
  assert.match(message("field-notes@2.0.0"), /not a published challenge/);
  // 1.0.0 is the JSON-answer version with no Python entrypoint.
  assert.match(message("frequency-map@1.0.0"), /can't run/);
});
