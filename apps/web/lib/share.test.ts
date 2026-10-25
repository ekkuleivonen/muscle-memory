import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codeFragment,
  codeFromHash,
  decodeCode,
  encodeCode,
  MAX_CODE_FRAGMENT,
  MAX_JSON_BYTES,
  REFUSALS,
  solutionOf,
  startCopy,
  type SharedFile,
} from "./share";

const pack = async (value: unknown) => {
  const deflated = await new Response(
    new Blob([JSON.stringify(value)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw")),
  ).arrayBuffer();
  return Buffer.from(deflated).toString("base64url");
};
async function packedOf(file: SharedFile) {
  const out = await encodeCode(file);
  assert.ok(out.ok, `refused: ${!out.ok && out.reason}`);
  return out.packed;
}
const refusal = async (file: SharedFile) => {
  const out = await encodeCode(file);
  return out.ok ? "shared" : out.reason;
};

test("shared code survives its fragment, and anything we would not have made is refused", async () => {
  const file = {
    path: "count_words.py",
    text: "def count_words(text):\n    return len(text.split())\n",
  };
  const packed = await packedOf(file);
  assert.match(packed, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeCode(packed), file);
  assert.equal(codeFromHash(codeFragment(packed)), packed);
  assert.equal(codeFragment(null), "");
  for (const hash of ["", "#", "#code=", "#code=a b", "#other=abc", "#code=abc&x=1"])
    assert.equal(codeFromHash(hash), null, hash);

  for (const value of ["", "!", "AAAA", Buffer.from("not deflate").toString("base64url")])
    assert.equal(await decodeCode(value), null, value);
  // Another format version, a list of files (the old format), a bad name or a non-string text.
  assert.equal(await decodeCode(await pack({ v: 1, f: [["a.py", "x"]] })), null);
  assert.equal(await decodeCode(await pack({ v: 3, p: "a.py", t: "x" })), null);
  assert.equal(await decodeCode(await pack({ v: 2, p: "<img src=x>", t: "x" })), null);
  assert.equal(await decodeCode(await pack({ v: 2, p: "a.py", t: 1 })), null);
  // A small link that inflates into something huge is refused before it is all read.
  assert.equal(await decodeCode(await pack({ v: 2, p: "a.py", t: "a".repeat(5_000_000) })), null);
});

test("all the code or none: bad names and partial files are refused, never cut", async () => {
  for (const path of ["../etc/passwd", "src/../x.py", "/abs.py", "<img>.py", "a b.py", ".hidden", ""])
    assert.equal(await refusal({ path, text: "x" }), "invalid-path", path);
  assert.equal(await refusal({ path: "f.py", text: "x = 1\n", truncated: true }), "incomplete");
  for (const reason of ["invalid-path", "incomplete", "too-large", "missing"] as const)
    assert.ok(REFUSALS[reason].length > 10);
});

test("every code link that is made reads back exactly, whatever the characters", async () => {
  // 3 UTF-8 bytes per character: within the character limit, beyond the byte budget.
  const wide = "// " + "界".repeat(50_000) + "\nexport const x = 1;\n";
  assert.equal(await refusal({ path: "wide.js", text: wide }), "too-large");
  // Just under the byte budget: compresses into a link, and must decode.
  const fits = "// " + "界".repeat(Math.floor((MAX_JSON_BYTES - 200) / 3)) + "\n";
  assert.deepEqual(await decodeCode(await packedOf({ path: "fits.js", text: fits })), {
    path: "fits.js",
    text: fits,
  });
  // Control characters escape to six bytes each in JSON (\u0001): counted as bytes, not characters.
  const controls = Array.from({ length: 30_000 }, (_, i) => String.fromCharCode(1 + (i % 8))).join("");
  assert.equal(await refusal({ path: "ctl.txt", text: controls }), "too-large");
  for (const [i, text] of [
    'tabs\tquotes " backslashes \\ newlines\r\n nul \u0000 bell \u0007 escape \u001b',
    "emoji 🧪👩🏽‍💻 combining é RTL ‏שלום‎ BOM ﻿ line sep   para sep  ",
    "</script><script>alert(1)</script> ${template} `backtick`",
    "界".repeat(1000),
    // A lone surrogate is escaped by JSON, so even that comes back unchanged.
    "a\ud800b\udfff",
  ].entries()) {
    const file = { path: `case_${i}.ts`, text };
    assert.deepEqual(await decodeCode(await packedOf(file)), file);
  }

  // Whatever is accepted decodes: random mixes of the above, near the limits.
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647);
  const alphabet = ["a", "界", "\u0001", '"', "\\", "\n", "🧪", " ", "é"];
  for (let round = 0; round < 12; round++) {
    const file = {
      path: `r${round}.js`,
      text: Array.from({ length: next() % 40_000 }, () => alphabet[next() % alphabet.length]).join(""),
    };
    const out = await encodeCode(file);
    if (out.ok) assert.deepEqual(await decodeCode(out.packed), file, `round ${round}`);
    else assert.equal(out.reason, "too-large", `round ${round}`);
  }
});

test("code too big for a link is refused rather than cut", async () => {
  let seed = 1;
  const noise = Array.from({ length: 40_000 }, () =>
    String.fromCharCode(33 + ((seed = (seed * 48271) % 2147483647) % 90)),
  ).join("");
  assert.equal(await refusal({ path: "big.py", text: noise }), "too-large");
  const fits = await packedOf({ path: "ok.py", text: "x = 1\n".repeat(2000) });
  assert.ok(fits.length <= MAX_CODE_FRAGMENT);
});

test("the solution offered is the checked artifact's file, exactly, or nothing", () => {
  const run = (runId: string, codeArtifactId: string) => ({
    kind: "observation",
    recordId: `o-${runId}`,
    payload: JSON.stringify({
      type: "practice.run",
      data: { runId, codeArtifactId, status: "result" },
    }),
  });
  const artifact = (id: string, text: string, truncated = false) => ({
    kind: "artifact",
    recordId: id,
    payload: JSON.stringify({
      truncated,
      files: { "collected.sql": { text, capture: { truncated } } },
    }),
  });
  const sql = "SELECT o.partner,\r\n  COALESCE(SUM(p.amount), 0) AS collected -- 界\n";
  const records = [
    run("r-1", "s.code.1"),
    artifact("s.code.1", "SELECT 1;\n"),
    run("r-2", "s.code.2"),
    artifact("s.code.2", sql),
  ];
  // The completing run's code, not an earlier one.
  assert.deepEqual(solutionOf(records, "r-2", "collected.sql"), {
    path: "collected.sql",
    text: sql,
    truncated: false,
  });
  // A copy kept only in part is passed as such, so sharing it is refused, never cut.
  const cut = [run("r-3", "s.code.3"), artifact("s.code.3", "SELECT", true)];
  assert.equal(solutionOf(cut, "r-3", "collected.sql")?.truncated, true);
  // No run, no artifact, or another file: nothing to offer.
  assert.equal(solutionOf(records, "r-9", "collected.sql"), null);
  assert.equal(solutionOf([run("r-4", "gone")], "r-4", "collected.sql"), null);
  assert.equal(solutionOf(records, "r-2", "other.sql"), null);
});

test("only a card on the live revision claims the sender's starting code", () => {
  const same = startCopy("SQL-002", true);
  assert.match(same.lede, /same starting code they did/);
  assert.equal(same.cta, "Try SQL-002 yourself →");
  // A card checked on an earlier revision: the current challenge.
  const current = startCopy("SQL-002", false);
  assert.equal(
    current.lede,
    "Start from the current challenge’s code in your own attempt: nothing of theirs comes with it.",
  );
  assert.equal(current.cta, "Try the current version of SQL-002 →");
  assert.doesNotMatch(current.lede, /same|they did/);
});
