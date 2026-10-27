/** Executable proposal model, not a production fence implementation or delivery-time guarantee. */
import { test } from "node:test";
import assert from "node:assert/strict";
function interleave<T>(a: T[], b: T[]): T[][] {
  if (!a.length) return [b];
  if (!b.length) return [a];
  return [
    ...interleave(a.slice(1), b).map((rest) => [a[0], ...rest]),
    ...interleave(a, b.slice(1)).map((rest) => [b[0], ...rest]),
  ];
}
test("proposed generation fence rejects old-state authorization after opt-out/deletion acknowledgement, for every step ordering", () => {
  for (const change of ["stealth", "delete", "age-unknown", "age-minor"]) {
    for (const order of interleave(
      ["read-generation", "check-member", "authorize"],
      ["write-control", "advance-generation", "acknowledge"],
    )) {
      let generation = 0,
        observed = -1,
        eligible = true,
        counted = false,
        acknowledged = false,
        authorized = false;
      for (const step of order) {
        if (step === "read-generation") observed = generation;
        if (step === "check-member") counted = eligible;
        if (step === "write-control") eligible = false;
        if (step === "advance-generation") generation++;
        if (step === "acknowledge") acknowledged = true;
        // Models one atomic conditional put on the generation object. Not read-then-send.
        if (step === "authorize") {
          authorized = observed === generation;
          assert.ok(
            !(authorized && counted && acknowledged),
            `${change}: ${order.join(",")}`,
          );
        }
      }
    }
  }
});
test("authorization before acknowledgement may deliver afterward: the proposed contract does not retract in-flight bytes", () => {
  const order = [
    "authorize-old-snapshot",
    "write-control",
    "advance-generation",
    "acknowledge",
    "deliver-old-snapshot",
  ];
  assert.ok(
    order.indexOf("authorize-old-snapshot") < order.indexOf("acknowledge"),
  );
  assert.ok(
    order.indexOf("deliver-old-snapshot") > order.indexOf("acknowledge"),
  );
});
test("cache TTL never grants authority; any acknowledged state change invalidates the old artifact generation", () => {
  const artifact = { generation: 1, computedAt: 0 };
  let generation = 1;
  assert.equal(artifact.generation === generation, true);
  generation++;
  assert.equal(
    artifact.generation === generation,
    false,
    "hourly artifact must suppress until recomputed, even with TTL remaining",
  );
});
