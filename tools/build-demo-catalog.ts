/**
 * Synthetic demo catalog for designing discovery against a realistic shape. Never shipped as
 * real content: the web app merges it only when NEXT_PUBLIC_DEMO_CATALOG=1. Authored through
 * the same lifecycle as the reference catalog, so it obeys the same validation.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  emptyCatalog,
  saveDraft,
  preview,
  markTested,
  publish,
  verifyCatalog,
  type ContentRef,
} from "../packages/catalog/catalog";

const challenge = (
  id: string,
  fields: {
    title: string;
    summary: string;
    difficulty: "warm-up" | "easy" | "medium" | "hard";
    kind: "feature" | "bug" | "performance" | "refactor";
    language: string;
    skills: string[];
    task: string;
    inputs: unknown[];
    expected: unknown[];
    hints?: string[];
    comments?: { author: string; role?: string; body: string }[];
  },
) => ({
  id,
  version: "1.0.0",
  assessment_version: "1.0.0",
  hints: [],
  ...fields,
});

const challenges = [
  challenge("rate-limiter", {
    title: "Rate-limit the checkout endpoint",
    kind: "feature",
    comments: [
      {
        author: "Sam R",
        role: "SRE",
        body: "We got hammered by a retry storm last night. Keep it simple, a sliding window is fine.",
      },
    ],
    summary: "Allow at most n requests in any sliding window.",
    difficulty: "medium",
    language: "typescript",
    skills: ["sliding-window", "queues"],
    task: "Write allow(times, limit, windowMs): for each request time, return whether it is allowed when at most `limit` requests may fall inside any window of `windowMs`.",
    inputs: [
      [[0, 1, 2, 3], 3, 10],
      [[], 1, 10],
      [[0, 10, 20], 1, 10],
    ],
    expected: [[true, true, true, false], [], [true, true, true]],
    hints: ["Keep only the timestamps still inside the window."],
  }),
  challenge("parse-log-line", {
    title: "Log parser drops fields on 5xx lines",
    kind: "bug",
    comments: [
      {
        author: "Sam R",
        role: "SRE",
        body: "Alerting is blind to the 502s because duration and status come back empty.",
      },
      {
        author: "Priya K",
        role: "Data",
        body: "Durations are always whole milliseconds, suffixed with ms.",
      },
    ],
    summary: "Turn an access log line into a structured record.",
    difficulty: "easy",
    language: "go",
    skills: ["parsing", "strings"],
    task: 'Write ParseLine(line) for lines like "GET /cart 200 12ms", returning method, path, status and duration in milliseconds.',
    inputs: ["GET /cart 200 12ms", "POST /pay 502 1300ms"],
    expected: [
      { method: "GET", path: "/cart", status: 200, ms: 12 },
      { method: "POST", path: "/pay", status: 502, ms: 1300 },
    ],
  }),
  challenge("top-customers", {
    title: "Top customers report for stand-up",
    kind: "feature",
    comments: [
      {
        author: "Lena M",
        role: "Product",
        body: "Just the totals per customer, biggest first. No need for a chart.",
      },
    ],
    summary: "Rank customers by what they spent tonight.",
    difficulty: "easy",
    language: "sql",
    skills: ["aggregation", "sorting"],
    task: "Given orders(id, customer, total), select each customer and the sum of their totals, highest first.",
    inputs: [
      {
        orders: [
          [1, "ana", 30],
          [2, "bo", 10],
          [3, "ana", 5],
        ],
      },
    ],
    expected: [
      [
        ["ana", 35],
        ["bo", 10],
      ],
    ],
  }),
  challenge("ring-buffer", {
    title: "Keep only the latest lamp readings",
    kind: "feature",
    summary: "A fixed-size log that overwrites its oldest entry.",
    difficulty: "medium",
    language: "c",
    skills: ["arrays", "modular-arithmetic"],
    task: "Implement a ring buffer of capacity n. Given a sequence of pushes, return the contents oldest first.",
    inputs: [
      [3, [1, 2, 3, 4]],
      [2, []],
    ],
    expected: [[2, 3, 4], []],
  }),
  challenge("morse-decoder", {
    title: "Morse decoder merges separate words",
    kind: "bug",
    comments: [
      {
        author: "Mateo O",
        role: "Backend",
        body: "Three spaces between words, one between letters. The old code treated both the same.",
      },
    ],
    summary: "Read the keeper's signal lamp.",
    difficulty: "easy",
    language: "rust",
    skills: ["maps", "strings"],
    task: "Write decode(signal): letters are separated by one space and words by three. Return the uppercase text.",
    inputs: ["... --- ...", ".... ..   - .... . .-. ."],
    expected: ["SOS", "HI THERE"],
  }),
  challenge("word-wrap", {
    title: "Logbook lines overflow the printer",
    kind: "bug",
    summary: "Fit the logbook onto a narrow page.",
    difficulty: "easy",
    language: "python",
    skills: ["strings", "greedy"],
    task: "Write wrap(text, width): break text into lines of at most width characters without splitting words.",
    inputs: [
      ["the light is on", 7],
      ["", 5],
    ],
    expected: [["the", "light", "is on"], []],
  }),
  challenge("plant-schedule", {
    title: "Watering schedule for the co-op",
    kind: "feature",
    comments: [
      {
        author: "Lena M",
        role: "Product",
        body: "Day 0 counts. Basil on a 2-day cycle gets watered on day 0, 2 and 4.",
      },
    ],
    summary: "List the days each plant needs water.",
    difficulty: "warm-up",
    language: "php",
    skills: ["iteration", "dates"],
    task: "Write schedule(plants, days): each plant waters every `every` days starting on day 0. Return the watering days per plant within `days`.",
    inputs: [[[{ name: "basil", every: 2 }], 5]],
    expected: [{ basil: [0, 2, 4] }],
  }),
  challenge("garden-grid", {
    title: "Path finder times out on big gardens",
    kind: "performance",
    comments: [
      {
        author: "Sam R",
        role: "SRE",
        body: "The current version tries every route. A breadth-first search should be plenty.",
      },
    ],
    summary: "Find the shortest path between two beds.",
    difficulty: "medium",
    language: "javascript",
    skills: ["grids", "breadth-first-search"],
    task: "Write shortestPath(grid, from, to) over a grid of '.' paths and '#' beds. Return the number of steps, or -1.",
    inputs: [
      [
        ["..#", "...", "#.."],
        [0, 0],
        [2, 2],
      ],
      [
        [".#", "#."],
        [0, 0],
        [1, 1],
      ],
    ],
    expected: [4, -1],
  }),
  challenge("harvest-totals", {
    title: "Pick crops for the biggest harvest",
    kind: "feature",
    summary: "Choose crops to fill the rooftop for the biggest yield.",
    difficulty: "hard",
    language: "cpp",
    skills: ["dynamic-programming"],
    task: "Write bestYield(crops, area): each crop has an area and a yield and can be planted once. Return the largest total yield within the area.",
    inputs: [
      [
        [
          [2, 3],
          [3, 4],
          [4, 5],
        ],
        5,
      ],
      [[], 3],
    ],
    expected: [7, 0],
  }),
  challenge("seed-labels", {
    title: "Clean up the seed list markup",
    kind: "refactor",
    comments: [
      {
        author: "Ada N",
        role: "Frontend",
        body: "Screen readers announce it as one long string right now. A plain list is all we need.",
      },
    ],
    summary: "Mark up the seed list so every reader can use it.",
    difficulty: "warm-up",
    language: "html",
    skills: ["semantics", "accessibility"],
    task: "Render the seed names as an unordered list with one item per seed.",
    inputs: [["basil", "mint"]],
    expected: ["<ul><li>basil</li><li>mint</li></ul>"],
  }),
];

const adventures = [
  {
    id: "night-shift",
    key: "NS",
    title: "Night shift",
    summary: "Keep a small web shop running through a long night.",
    story:
      "The on-call phone buzzes at 02:14. Traffic is spiking, logs are scrolling and the shop must stay up until morning.",
    challenges: ["rate-limiter", "parse-log-line", "top-customers"],
  },
  {
    id: "lighthouse",
    key: "LH",
    title: "The lighthouse",
    summary: "Signals, logs and a keeper who writes everything down.",
    story:
      "The keeper has left, but the lamp still blinks and the logbook is full. Piece together the last week on the rock.",
    challenges: ["morse-decoder", "ring-buffer", "word-wrap"],
  },
  {
    id: "rooftop-garden",
    key: "RG",
    title: "Rooftop garden",
    summary: "Plan, water and harvest a garden above the city.",
    story:
      "A co-op is turning an empty roof into a garden. They have seeds, a sketch of the beds and a lot of enthusiasm.",
    challenges: [
      "seed-labels",
      "plant-schedule",
      "garden-grid",
      "harvest-totals",
    ],
  },
].map(({ challenges: ids, ...adventure }) => ({
  ...adventure,
  version: "1.0.0",
  presentation: "demo-text-v1",
  challenges: ids.map((id) => [id, "1.0.0"]),
}));

const at = "2026-10-24T00:00:00.000Z"; // Synthetic, deterministic across builds.
let catalog = emptyCatalog();
// Issue numbers follow each project's order at first publication and never change.
const numberOf = new Map(
  adventures.flatMap((a) =>
    a.challenges.map(([id], i) => [id, i + 1] as const),
  ),
);
for (const [kind, content] of [
  ...challenges.map(
    (c) => ["challenge", { ...c, number: numberOf.get(c.id) }] as const,
  ),
  ...adventures.map((a) => ["adventure", a] as const),
]) {
  const ref: ContentRef = { kind, id: content.id, version: content.version };
  catalog = saveDraft(catalog, kind, content, at);
  catalog = publish(markTested(preview(catalog, ref, at), ref, at), ref, at);
}
verifyCatalog(catalog);
const destination = resolve("content/demo/catalog.json");
const text = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== text)
    throw new Error(
      "Demo catalog is out of date. Run npm run build:demo-catalog.",
    );
  console.log("Demo catalog is current.");
} else {
  await mkdir(resolve("content/demo"), { recursive: true });
  await writeFile(destination, text);
}
