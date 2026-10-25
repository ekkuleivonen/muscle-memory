import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeResult, publicResult, type Result } from "./result";
import {
  codeFragment,
  codeFromHash,
  decodeCode,
  encodeCode,
  inspectCard,
  MAX_CODE_FRAGMENT,
  tryHref,
} from "./share";

const card: Result = {
  v: 2, k: "QUICK-4", l: "go", c: "ab12cd34ef56",
  t: 252, rd: 48, ks: 214, ty: 9, w: 71, r: 1, g: 1, p: 1, h: 0, ps: 0, lt: 0,
};
const segment = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

test("an issue link is its permanent key and nothing of the sender", () => {
  assert.equal(tryHref("RG-4"), "/try/RG-4");
});

test("only allowlisted fields leave the browser, whatever the card was built from", () => {
  const leaky = {
    ...card,
    participantId: "3f2a-participant",
    profile: { country: "FI", age: "25-34", experience: "10+" },
    records: [{ kind: "observation", payload: "{}" }],
    code: "def count_words(s): ...",
  } as unknown as Result;
  assert.deepEqual(publicResult(leaky), card);
  const json = Buffer.from(encodeResult(leaky), "base64url").toString();
  for (const secret of ["participant", "country", "records", "count_words"])
    assert.ok(!json.includes(secret), secret);
});

test("a result link is a result, an older version, or malformed; never a guess", () => {
  assert.deepEqual(inspectCard(encodeResult(card)), { kind: "result", result: card });
  assert.deepEqual(inspectCard(segment({ v: 1, k: "QUICK-4", t: 1 })), { kind: "older", key: "QUICK-4" });
  assert.deepEqual(inspectCard(segment({ v: 3, k: "<b>" })), { kind: "older", key: null });
  assert.deepEqual(inspectCard(encodeResult({ ...card, k: "INC-1", iv: "0a1b2c3d", a: 1 })), { kind: "older", key: "INC-1" });
  // A current card with a field out of range is not "older": it is not one we made.
  assert.deepEqual(inspectCard(encodeResult({ ...card, t: -1 })), { kind: "malformed" });
  for (const bad of ["", "%%%", "bm90IGpzb24", segment("just a string"), segment(null)])
    assert.deepEqual(inspectCard(bad), { kind: "malformed" }, bad);
});

test("shared code survives its fragment, and anything we would not have made is refused", async () => {
  const files = [
    { path: "src/count_words.py", text: "def count_words(text):\n    return len(text.split())\n" },
  ];
  const packed = await encodeCode(files);
  assert.ok(packed);
  assert.match(packed, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeCode(packed), files);
  assert.equal(codeFromHash(codeFragment(packed)), packed);
  assert.equal(codeFragment(null), "");
  for (const hash of ["", "#", "#code=", "#code=a b", "#other=abc", "#code=abc&x=1"])
    assert.equal(codeFromHash(hash), null, hash);

  // Paths that could escape the repo or carry markup are never shared or shown.
  assert.equal(await encodeCode([{ path: "../etc/passwd", text: "x" }]), null);
  assert.equal(await encodeCode([]), null);
  for (const value of ["", "!!!", "AAAA", Buffer.from("not deflate").toString("base64url")])
    assert.equal(await decodeCode(value), null, value);

  const pack = async (value: unknown) => {
    const deflated = await new Response(
      new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("deflate-raw")),
    ).arrayBuffer();
    return Buffer.from(deflated).toString("base64url");
  };
  assert.equal(await decodeCode(await pack({ v: 2, f: [["a.py", "x"]] })), null);
  assert.equal(await decodeCode(await pack({ v: 1, f: [["<img src=x>", "x"]] })), null);
  assert.equal(await decodeCode(await pack({ v: 1, f: [["a.py", 1]] })), null);
  // A small link that inflates into something huge is refused before it is all read.
  assert.equal(await decodeCode(await pack({ v: 1, f: [["a.py", "a".repeat(5_000_000)]] })), null);
});

test("code too big for a link is not shared rather than cut", async () => {
  let seed = 1;
  const noise = Array.from({ length: 40_000 }, () =>
    String.fromCharCode(33 + ((seed = (seed * 48271) % 2147483647) % 90)),
  ).join("");
  assert.equal(await encodeCode([{ path: "big.py", text: noise }]), null);
  const fits = await encodeCode([{ path: "ok.py", text: "x = 1\n".repeat(2000) }]);
  assert.ok(fits && fits.length <= MAX_CODE_FRAGMENT);
});
