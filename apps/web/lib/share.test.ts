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
  MAX_FILES,
  MAX_JSON_BYTES,
  REFUSALS,
  solutionOf,
  startCopy,
  tryHref,
  type SharedFile,
} from "./share";

const card: Result = {
  v: 2,
  k: "QUICK-4",
  l: "go",
  c: "ab12cd34ef56",
  t: 252,
  rd: 48,
  ks: 214,
  ty: 9,
  w: 71,
  r: 1,
  g: 1,
  p: 1,
  h: 0,
  ps: 0,
  lt: 0,
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
  assert.deepEqual(inspectCard(encodeResult(card)), {
    kind: "result",
    result: card,
  });
  assert.deepEqual(inspectCard(segment({ v: 1, k: "QUICK-4", t: 1 })), {
    kind: "older",
    key: "QUICK-4",
  });
  // Version 3 is current: one that doesn't decode is malformed, not "older".
  assert.deepEqual(inspectCard(segment({ v: 3, k: "<b>" })), {
    kind: "malformed",
  });
  assert.deepEqual(
    inspectCard(segment({ ...card, k: "INC-1", iv: "0a1b2c3d", a: 1 })),
    { kind: "older", key: "INC-1" },
  );
  // A current card with a field out of range is not "older": it is not one we made.
  assert.deepEqual(inspectCard(encodeResult({ ...card, t: -1 })), {
    kind: "malformed",
  });
  for (const bad of [
    "",
    "%%%",
    "bm90IGpzb24",
    segment("just a string"),
    segment(null),
  ])
    assert.deepEqual(inspectCard(bad), { kind: "malformed" }, bad);
});

test("shared code survives its fragment, and anything we would not have made is refused", async () => {
  const files = [
    {
      path: "src/count_words.py",
      text: "def count_words(text):\n    return len(text.split())\n",
    },
  ];
  const packed = await packedOf(files);
  assert.match(packed, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeCode(packed), files);
  assert.equal(codeFromHash(codeFragment(packed)), packed);
  assert.equal(codeFragment(null), "");
  for (const hash of [
    "",
    "#",
    "#code=",
    "#code=a b",
    "#other=abc",
    "#code=abc&x=1",
  ])
    assert.equal(codeFromHash(hash), null, hash);

  for (const value of [
    "",
    "!!!",
    "AAAA",
    Buffer.from("not deflate").toString("base64url"),
  ])
    assert.equal(await decodeCode(value), null, value);
  assert.equal(
    await decodeCode(await pack({ v: 2, f: [["a.py", "x"]] })),
    null,
  );
  assert.equal(
    await decodeCode(await pack({ v: 1, f: [["<img src=x>", "x"]] })),
    null,
  );
  assert.equal(await decodeCode(await pack({ v: 1, f: [["a.py", 1]] })), null);
  // A small link that inflates into something huge is refused before it is all read.
  assert.equal(
    await decodeCode(
      await pack({ v: 1, f: [["a.py", "a".repeat(5_000_000)]] }),
    ),
    null,
  );
});

const pack = async (value: unknown) => {
  const deflated = await new Response(
    new Blob([JSON.stringify(value)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw")),
  ).arrayBuffer();
  return Buffer.from(deflated).toString("base64url");
};
async function packedOf(files: SharedFile[]) {
  const out = await encodeCode(files);
  assert.ok(out.ok, `refused: ${!out.ok && out.reason}`);
  return out.packed;
}
const refusal = async (files: SharedFile[]) => {
  const out = await encodeCode(files);
  return out.ok ? "shared" : out.reason;
};

test("all the code or none: too many files, bad paths and partial files are refused, never dropped", async () => {
  const file = (i: number) => ({ path: `src/f${i}.py`, text: `x = ${i}\n` });
  const eight = Array.from({ length: MAX_FILES }, (_, i) => file(i));
  assert.deepEqual(await decodeCode(await packedOf(eight)), eight);
  assert.equal(await refusal([...eight, file(8)]), "too-many-files");
  assert.equal(await refusal([]), "empty");
  for (const path of [
    "../etc/passwd",
    "src/../x.py",
    "/abs.py",
    "<img>.py",
    "a b.py",
    ".hidden",
    "",
  ])
    assert.equal(
      await refusal([file(1), { path, text: "x" }]),
      "invalid-path",
      path,
    );
  assert.equal(
    await refusal([file(1), { ...file(2), truncated: true }]),
    "incomplete",
  );
  for (const reason of [
    "empty",
    "too-many-files",
    "invalid-path",
    "incomplete",
    "too-large",
  ] as const)
    assert.ok(REFUSALS[reason].length > 10);
});

test("every code link that is made reads back exactly, whatever the characters", async () => {
  // 3 UTF-8 bytes per character: within the character limit, beyond the byte budget.
  const wide = "// " + "界".repeat(50_000) + "\nexport const x = 1;\n";
  assert.equal(await refusal([{ path: "wide.js", text: wide }]), "too-large");
  // Just under the byte budget: compresses into a link, and must decode.
  const fits =
    "// " + "界".repeat(Math.floor((MAX_JSON_BYTES - 200) / 3)) + "\n";
  assert.deepEqual(
    await decodeCode(await packedOf([{ path: "fits.js", text: fits }])),
    [{ path: "fits.js", text: fits }],
  );
  // Control characters escape to six bytes each in JSON (\u0001): counted as bytes, not characters.
  const controls = Array.from({ length: 30_000 }, (_, i) =>
    String.fromCharCode(1 + (i % 8)),
  ).join("");
  assert.equal(
    await refusal([{ path: "ctl.txt", text: controls }]),
    "too-large",
  );
  const awkward = [
    'tabs\tquotes " backslashes \\ newlines\r\n nul \u0000 bell \u0007 escape \u001b',
    "emoji 🧪👩🏽‍💻 combining é RTL ‏שלום‎ BOM ﻿ line sep   para sep  ",
    "</script><script>alert(1)</script> ${template} `backtick`",
    "界".repeat(1000),
  ].map((text, i) => ({ path: `src/case_${i}.ts`, text }));
  assert.deepEqual(await decodeCode(await packedOf(awkward)), awkward);
  // A lone surrogate is escaped by JSON, so even that comes back unchanged.
  const lone = [{ path: "lone.js", text: "a\ud800b\udfff" }];
  assert.deepEqual(await decodeCode(await packedOf(lone)), lone);

  // Whatever is accepted decodes: random mixes of the above, near the limits.
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647);
  const alphabet = ["a", "界", "\u0001", '"', "\\", "\n", "🧪", " ", "é"];
  for (let round = 0; round < 12; round++) {
    const files = Array.from({ length: 1 + (next() % MAX_FILES) }, (_, i) => ({
      path: `src/r${round}_${i}.js`,
      text: Array.from(
        { length: next() % 20_000 },
        () => alphabet[next() % alphabet.length],
      ).join(""),
    }));
    const out = await encodeCode(files);
    if (out.ok)
      assert.deepEqual(await decodeCode(out.packed), files, `round ${round}`);
    else assert.equal(out.reason, "too-large", `round ${round}`);
  }
});

test("code too big for a link is refused rather than cut", async () => {
  let seed = 1;
  const noise = Array.from({ length: 40_000 }, () =>
    String.fromCharCode(33 + ((seed = (seed * 48271) % 2147483647) % 90)),
  ).join("");
  assert.equal(await refusal([{ path: "big.py", text: noise }]), "too-large");
  const fits = await packedOf([
    { path: "ok.py", text: "x = 1\n".repeat(2000) },
  ]);
  assert.ok(fits.length <= MAX_CODE_FRAGMENT);
});

test("public evidence survives the result link and strips nested private fields", () => {
  const ev = {
    v: 1,
    state: "merged",
    checks: { passed: 15, total: 15, result: "checks-passed" },
    first: { passed: 5, total: 15, result: "checks-failed" },
    hidden: { passed: 10, total: 10 },
    changed: { files: 2, added: 4, removed: 2 },
    pushes: 2,
    runs: 3,
    testedBeforePush: "tested-passing",
    failedPushes: 1,
    findings: { raised: 1, open: 0 },
    hints: 0,
    gaps: false,
    profile: { secret: "private-profile" },
    code: "private-source",
  };
  const encoded = encodeResult({ ...card, ev } as unknown as Result);
  const json = Buffer.from(encoded, "base64url").toString();
  assert.ok(!json.includes("private-profile"));
  assert.ok(!json.includes("private-source"));
  const read = inspectCard(encoded);
  assert.equal(read.kind, "result");
  if (read.kind === "result") {
    assert.equal(read.result.ev?.first?.passed, 5);
    assert.equal(read.result.ev?.checks.passed, 15);
    assert.equal(read.result.ev?.findings.open, 0);
  }
});

test("one solution file is the usual link, and a link from a multi-file challenge still reads back whole", async () => {
  // A link made before challenges had one file: the bytes `encodeCode` wrote then (format v1,
  // unchanged), with three files. Every one comes back, in order and in full.
  const legacy = [
    {
      path: "src/composer.ts",
      text: "export const words = (s: string) =>\r\n  s.trim() ? s.trim().split(/\\s+/).length : 0;\n",
    },
    {
      path: "src/plural.ts",
      text: 'export const plural = (n: number) => (n === 1 ? "word" : "words");\n',
    },
    {
      path: "README.md",
      text: "# Composer\n\nCounts words — “smart quotes” and 界 included.\n",
    },
  ];
  const packed = await packedOf(legacy);
  assert.deepEqual(await decodeCode(packed), legacy);
  const solution = [
    {
      path: "solution.sql",
      text: "SELECT customer_id, SUM(total)\nFROM orders\nGROUP BY customer_id;\n",
    },
  ];
  assert.deepEqual(await decodeCode(await packedOf(solution)), solution);
});

test("the solution offered is the checked artifact's editable file, exactly, or nothing", () => {
  const run = (runId: string, codeArtifactId: string) => ({
    kind: "observation",
    recordId: `o-${runId}`,
    payload: JSON.stringify({
      type: "observation.workspace.run",
      data: { runId, codeArtifactId, status: "result" },
    }),
  });
  const artifact = (id: string, text: string, truncated = false) => ({
    kind: "artifact",
    recordId: id,
    payload: JSON.stringify({
      truncated,
      files: {
        "queries/collected.sql": { text, capture: { truncated } },
        "README.md": {
          text: "# not editable\n",
          capture: { truncated: false },
        },
      },
    }),
  });
  const sql =
    "SELECT o.partner,\r\n  COALESCE(SUM(p.amount), 0) AS collected -- 界\n";
  const records = [
    run("r-1", "s.code.1"),
    artifact("s.code.1", "SELECT 1;\n"),
    run("r-2", "s.code.2"),
    artifact("s.code.2", sql),
  ];
  // The completing run's code, not an earlier one, and only the editable file.
  assert.deepEqual(solutionOf(records, "r-2", ["queries/collected.sql"]), [
    { path: "queries/collected.sql", text: sql, truncated: false },
  ]);
  // A copy kept only in part is passed as such, so sharing it is refused, never cut.
  const cut = [run("r-3", "s.code.3"), artifact("s.code.3", "SELECT", true)];
  assert.equal(
    solutionOf(cut, "r-3", ["queries/collected.sql"])?.[0].truncated,
    true,
  );
  // No run, no artifact, or a missing editable file: nothing to offer.
  assert.equal(solutionOf(records, "r-9", ["queries/collected.sql"]), null);
  assert.equal(
    solutionOf([run("r-4", "gone")], "r-4", ["queries/collected.sql"]),
    null,
  );
  assert.equal(solutionOf(records, "r-2", ["other.sql"]), null);
});

test("only a card on the live revision claims the sender's starting code", () => {
  const same = startCopy("DATA-6", true);
  assert.match(same.lede, /same starting code they did/);
  assert.equal(same.cta, "Try DATA-6 yourself →");
  // An earlier revision, or a v2 card with no revision identity: the current challenge.
  const current = startCopy("DATA-6", false);
  assert.equal(
    current.lede,
    "Start from the current challenge’s code in your own attempt: nothing of theirs comes with it.",
  );
  assert.equal(current.cta, "Try the current version of DATA-6 →");
  assert.doesNotMatch(current.lede, /same|they did/);
});
