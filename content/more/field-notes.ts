import type { SeedFile, SeedIssue } from "../seed";
import { lena, mateo, priya } from "../team";

/*
 * Field notes grows from one warm-up into a small notebook package: notebook lines typed up
 * from the paper field notebook (labels.py), species names as the herbarium files them
 * (names.py), lengths in millimetres (units.py), and the reports built on them.
 */

/** A notebook line as the volunteers type it: date | site | species | length | count. */
const row = (date: string, site: string, species: string, length: string, count: number | string) =>
  `${date} | ${site} | ${species} | ${length} | ${count}`;

/** A typed-up page: its lines as one text. */
const page = (...lines: string[]) => lines.join("\n");

const INIT: SeedFile = {
  path: "notebook/__init__.py",
  role: "read",
  language: "python",
  text: `"""The field notebook: specimen lots typed up from the paper notebook, and what we report on them."""
`,
};

const LABELS: SeedFile = {
  path: "notebook/labels.py",
  role: "read",
  language: "python",
  text: `"""Notebook lines, as typed up from the paper field notebook. One line per specimen lot:

    2026-06-03 | Ridge B | Carabus nemoralis | 14.5 mm | 2

date | site | species | body length | individuals in the lot. The length is left blank when
nothing was measured.
"""

FIELDS = ("date", "site", "species", "length", "count")


def fields(line):
    """The five fields of a line, stripped, as written."""
    parts = [part.strip() for part in line.split("|")]
    if len(parts) != len(FIELDS):
        raise ValueError(f"expected {len(FIELDS)} fields: {line!r}")
    return parts


def parse_line(line):
    """A line as a dict: every field as written, the count as a number."""
    row = dict(zip(FIELDS, fields(line)))
    row["count"] = int(row["count"])
    return row
`,
};

const NAMES: SeedFile = {
  path: "notebook/names.py",
  role: "read",
  language: "python",
  text: `"""Species names the way the herbarium database files them."""


def canonical_name(name):
    """'  carabus   NEMORALIS ' -> 'Carabus nemoralis': the genus capitalised, everything after
    it lowercase, one space between words."""
    words = name.split()
    if not words:
        return ""
    return " ".join([words[0].capitalize()] + [word.lower() for word in words[1:]])
`,
};

// ---------------------------------------------------------------------------------------------
// Species tally: a refactor onto the shared name helper.

const TALLY_STARTER = `"""Individuals per species for the end-of-day tally sheet."""
from notebook.labels import parse_line


def _clean(name):
    return name.strip().title()


def species_tally(lines):
    """Individuals per species across the notebook lines, keyed by species name."""
    totals = {}
    for line in lines:
        if not line.strip():
            continue
        row = parse_line(line)
        name = _clean(row["species"])
        totals[name] = totals.get(name, 0) + row["count"]
    return totals
`;

const TALLY_REFERENCE = `"""Individuals per species for the end-of-day tally sheet."""
from notebook.labels import parse_line
from notebook.names import canonical_name


def species_tally(lines):
    """Individuals per species across the notebook lines, keyed by the herbarium's name."""
    totals = {}
    for line in lines:
        if not line.strip():
            continue
        row = parse_line(line)
        name = canonical_name(row["species"])
        totals[name] = totals.get(name, 0) + row["count"]
    return totals
`;

const TALLY_KEEPS_CLEAN = `"""Individuals per species for the end-of-day tally sheet."""
from notebook.labels import parse_line
from notebook.names import canonical_name


def _clean(name):
    return canonical_name(name)


def species_tally(lines):
    """Individuals per species across the notebook lines, keyed by species name."""
    totals = {}
    for line in lines:
        if not line.strip():
            continue
        row = parse_line(line)
        name = _clean(row["species"])
        totals[name] = totals.get(name, 0) + row["count"]
    return totals
`;

const TALLY_OWN_COPY = `"""Individuals per species for the end-of-day tally sheet."""
from notebook.labels import parse_line


def _tidy(name):
    words = name.split()
    return " ".join([words[0].capitalize()] + [w.lower() for w in words[1:]])


def species_tally(lines):
    """Individuals per species across the notebook lines, keyed by species name."""
    totals = {}
    for line in lines:
        if not line.strip():
            continue
        row = parse_line(line)
        name = _tidy(row["species"])
        totals[name] = totals.get(name, 0) + row["count"]
    return totals
`;

const D = "2026-06-03";
const tallyRow = (species: string, count = 1) => row(D, "Ridge B", species, "14.5 mm", count);

const speciesTally: SeedIssue = {
  id: "species-tally-shared-names",
  title: "Herbarium import creates duplicate species from the tally sheet",
  summary: "Monday's import added 14 \"new\" species the herbarium already had.",
  kind: "refactor",
  difficulty: "easy",
  language: "python",
  skills: ["refactoring", "reading-code", "strings"],
  task: `Monday's import into the herbarium database created 14 "new" species that we already had. From the import log:

\`\`\`text
new species: Carabus Nemoralis        (have: Carabus nemoralis)
new species: Carabus Sp.              (have: Carabus sp.)
new species: Pterostichus Niger       (have: Pterostichus niger)
\`\`\`

\`species_tally(lines)\` in \`notebook/tally.py\` totals individuals per species for the end-of-day tally sheet, and the sheet is what gets imported. The import matches names exactly, so every species on the sheet must be written the way the herbarium files it (\`notebook/names.py\` is what the herbarium export uses), with one naming rule for both, so they can't drift apart again. Blank lines are skipped, as now.`,
  entry: "notebook/tally.py",
  entrypoint: "species_tally",
  starter: TALLY_STARTER,
  files: [INIT, LABELS, NAMES],
  inputs: [
    [tallyRow("Carabus nemoralis", 2), tallyRow("carabus nemoralis")],
    [],
    [tallyRow("Pterostichus  niger", 3), tallyRow("Pterostichus niger", 2)],
    [tallyRow("Carabus sp.", 4)],
    [tallyRow("ABAX PARALLELEPIPEDUS", 2), tallyRow("Abax parallelepipedus")],
    [tallyRow("carabus   NEMORALIS", 1), tallyRow("Carabus Nemoralis", 1)],
    ["", tallyRow("Nebria brevicollis", 2), "   ", tallyRow("nebria brevicollis", 5), ""],
    [tallyRow("Carabus problematicus", 0)],
    [
      tallyRow("Carabus nemoralis", 2),
      tallyRow("Pterostichus niger", 1),
      tallyRow("carabus nemoralis", 3),
      tallyRow("Abax parallelepipedus", 4),
      tallyRow("PTEROSTICHUS NIGER", 2),
    ],
    [tallyRow("Carabus cf. nemoralis", 1), tallyRow("carabus CF. Nemoralis", 2)],
    [tallyRow("Carabus auro-nitens", 1), tallyRow("carabus Auro-Nitens", 1)],
    [tallyRow("Carabus", 3), tallyRow("CARABUS", 1)],
    [tallyRow("CARABUS nemoralis", 1), tallyRow("Carabus nemoralis", 1)],
    [tallyRow("Carabus\tnemoralis", 2), tallyRow("Carabus nemoralis", 1)],
    [tallyRow("Carabus nemoralis NEMORALIS", 1), tallyRow("carabus nemoralis nemoralis", 1)],
    [tallyRow("ötiorhynchus sulcatus", 2), tallyRow("Ötiorhynchus Sulcatus", 1)],
    [tallyRow("Leistus o'brieni", 1), tallyRow("Leistus O'Brieni", 1)],
  ],
  expected: [
    {"Carabus nemoralis":3},
    {},
    {"Pterostichus niger":5},
    {"Carabus sp.":4},
    {"Abax parallelepipedus":3},
    {"Carabus nemoralis":2},
    {"Nebria brevicollis":7},
    {"Carabus problematicus":0},
    {"Carabus nemoralis":5,"Pterostichus niger":3,"Abax parallelepipedus":4},
    {"Carabus cf. nemoralis":3},
    {"Carabus auro-nitens":2},
    {"Carabus":4},
    {"Carabus nemoralis":2},
    {"Carabus nemoralis":3},
    {"Carabus nemoralis nemoralis":2},
    {"Ötiorhynchus sulcatus":3},
    {"Leistus o'brieni":2},
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  comments: [
    priya(
      "The import doesn't care how a name looks on the sheet, only whether it matches the herbarium exactly. names.py is what the herbarium export uses, so that's the one to trust.",
    ),
  ],
  hints: [
    "Before changing anything, compare what the two clean-up functions return for a name from the import log.",
    {
      text: "The tally sheet's job is to agree with the herbarium. Which file in the package already describes how the herbarium writes a name?",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "priya-keep-clean",
      author: "Priya K",
      role: "Data",
      where: "review",
      severity: "nit",
      text: [
        "Nit: could we delete `_clean` rather than keep it around? Two copies of the same rule is how we got here.",
        "Nit: `_clean` is still in tally.py. If it stays, someone will change it again and the two will drift. Can it go?",
      ],
      when: { pattern: "def _clean\\(", present: true, file: "notebook/tally.py" },
      repeat: "while-true",
      resolve: "explicit",
    },
    {
      id: "priya-shared-helper",
      author: "Priya K",
      role: "Data",
      where: "review",
      severity: "blocking",
      text: [
        "This writes the rule out again inside tally.py. Can it use `canonical_name` from names.py, so there's one place the herbarium's naming lives?",
      ],
      when: { pattern: "canonical_name", present: false, file: "notebook/tally.py" },
      repeat: "while-true",
      resolve: "explicit",
    },
  ],
  private: {
    reference: { "notebook/tally.py": TALLY_REFERENCE },
    alternatives: [
      // The module rather than the function, and a dict that counts.
      {
        "notebook/tally.py": `"""Individuals per species for the end-of-day tally sheet."""
from collections import Counter

from notebook import names
from notebook.labels import parse_line


def species_tally(lines):
    """Individuals per species across the notebook lines, keyed by the herbarium's name."""
    totals = Counter()
    for line in lines:
        if line.strip():
            row = parse_line(line)
            totals[names.canonical_name(row["species"])] += row["count"]
    return dict(totals)
`,
      },
    ],
    wrong: [
      // The old clean-up, kept: title case is not how the herbarium writes a name.
      { "notebook/tally.py": TALLY_STARTER.replace("name.strip().title()", "name.strip().capitalize()") },
      // Lowercases everything, genus included.
      {
        "notebook/tally.py": TALLY_REFERENCE.replace(
          'name = canonical_name(row["species"])',
          'name = " ".join(row["species"].split()).lower()',
        ),
      },
    ],
    examples: {
      "priya-keep-clean": {
        fires: [{ "notebook/tally.py": TALLY_KEEPS_CLEAN }],
        quiet: [{ "notebook/tally.py": TALLY_REFERENCE }],
      },
      "priya-shared-helper": {
        fires: [{ "notebook/tally.py": TALLY_OWN_COPY }],
        quiet: [{ "notebook/tally.py": TALLY_REFERENCE }, { "notebook/tally.py": TALLY_KEEPS_CLEAN }],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Length report: a bug whose fix spans units.py and report.py.

const UNITS_STARTER = `"""Lengths as written in the notebook, converted to millimetres. The label printer uses
to_mm too."""

MM_PER = {"mm": 1, "cm": 10}


def to_mm(text):
    """'14.5 mm' or '1.2 cm' in millimetres."""
    value, unit = text.split()
    return float(value) * MM_PER[unit]
`;

const UNITS_REFERENCE = String.raw`"""Lengths as written in the notebook, converted to millimetres. The label printer uses
to_mm too."""
import re

MM_PER = {"mm": 1, "cm": 10, "in": 25.4}

LENGTH = re.compile(r"(\d+(?:\.\d+)?)\s*([a-z]+)", re.IGNORECASE)


def to_mm(text):
    """'14.5 mm', '1.2 cm', '0.6 in', '12mm' or '1.3 CM' in millimetres."""
    match = LENGTH.fullmatch(text.strip())
    if not match:
        raise ValueError(f"not a length: {text!r}")
    value, unit = match.groups()
    return float(value) * MM_PER[unit.lower()]
`;

const REPORT_STARTER = `"""Body lengths per species for the season report."""
from notebook.labels import parse_line
from notebook.units import to_mm


def length_report(lines):
    """Per species: how many lots were measured, and the shortest, longest and mean length in
    millimetres, each to one decimal."""
    lengths = {}
    for line in lines:
        row = parse_line(line)
        lengths.setdefault(row["species"], []).append(to_mm(row["length"]))
    return {
        species: {
            "measured": len(values),
            "min_mm": min(values),
            "max_mm": max(values),
            "mean_mm": round(sum(values) / len(values), 1),
        }
        for species, values in lengths.items()
    }
`;

const REPORT_REFERENCE = `"""Body lengths per species for the season report."""
from notebook.labels import parse_line
from notebook.units import to_mm

# Left blank when nothing was measured; a ? when the volunteer wasn't sure.
UNMEASURED = {"", "?"}


def length_report(lines):
    """Per species: how many lots were measured, and the shortest, longest and mean length in
    millimetres, each to one decimal. A species with no measured lot still appears."""
    lengths = {}
    for line in lines:
        row = parse_line(line)
        values = lengths.setdefault(row["species"], [])
        if row["length"] not in UNMEASURED:
            values.append(to_mm(row["length"]))
    return {species: _summary(values) for species, values in lengths.items()}


def _summary(values):
    if not values:
        return {"measured": 0, "min_mm": None, "max_mm": None, "mean_mm": None}
    return {
        "measured": len(values),
        "min_mm": round(min(values), 1),
        "max_mm": round(max(values), 1),
        "mean_mm": round(sum(values) / len(values), 1),
    }
`;

const REPORT_CONVERTS_INCHES = `"""Body lengths per species for the season report."""
from notebook.labels import parse_line
from notebook.units import to_mm

UNMEASURED = {"", "?"}


def _length(text):
    if text.lower().endswith("in"):
        return float(text[:-2]) * 25.4
    return to_mm(text)


def length_report(lines):
    """Per species: how many lots were measured, and the shortest, longest and mean length in
    millimetres, each to one decimal. A species with no measured lot still appears."""
    lengths = {}
    for line in lines:
        row = parse_line(line)
        values = lengths.setdefault(row["species"], [])
        if row["length"] not in UNMEASURED:
            values.append(_length(row["length"]))
    return {
        species: {
            "measured": len(values),
            "min_mm": round(min(values), 1) if values else None,
            "max_mm": round(max(values), 1) if values else None,
            "mean_mm": round(sum(values) / len(values), 1) if values else None,
        }
        for species, values in lengths.items()
    }
`;

const lot = (species: string, length: string, count = 1) =>
  row(D, "Alder Creek", species, length, count);
const CN = "Carabus nemoralis";
const PN = "Pterostichus niger";

const lengthReport: SeedIssue = {
  id: "length-report-inches",
  title: "Length report crashes on the Oregon volunteers' sheets",
  summary: "Read lengths in inches and without a space, and leave unmeasured lots out of the numbers.",
  kind: "bug",
  difficulty: "medium",
  language: "python",
  skills: ["debugging", "parsing", "units"],
  task: `The season report fails as soon as it reaches the sheets from the Oregon volunteers:

\`\`\`text
  File "notebook/units.py", line 9, in to_mm
    return float(value) * MM_PER[unit]
KeyError: 'in'
\`\`\`

Their sheets differ from ours in three ways:

- lengths in inches (\`0.6 in\`), and sometimes no space or a capital unit (\`12mm\`, \`1.3 CM\`, \`0.5in\`);
- lots nobody measured have the length left blank, or a \`?\` when the volunteer wasn't sure.

\`length_report(lines)\` in \`notebook/report.py\` gives, per species, the number of lots measured and the shortest, longest and mean length in millimetres, each rounded to one decimal. An inch is 25.4 mm. Unmeasured lots don't count towards any of those numbers, but their species still appears: with no measured lot it shows \`measured: 0\` and \`None\` for the lengths.

The label printer converts lengths with \`to_mm\` in \`notebook/units.py\` too, and it should print the inch lots as well.`,
  entry: "notebook/report.py",
  entrypoint: "length_report",
  starter: REPORT_STARTER,
  files: [
    INIT,
    LABELS,
    { path: "notebook/units.py", role: "edit", language: "python", text: UNITS_STARTER },
  ],
  inputs: [
    [lot(CN, "14.6 mm"), lot(CN, "1.7 cm")],
    [lot(CN, "0.6 in"), lot(CN, "0.7 in", 2)],
    [lot(PN, "12mm"), lot(PN, "1.3 CM")],
    [lot(CN, "15 mm"), lot(CN, ""), lot(PN, "?"), lot(PN, "", 3)],
    [],
    [lot(CN, "0.5in")],
    [lot(CN, "2 cm"), lot(CN, "18 mm")],
    [lot(PN, "?")],
    [lot(CN, "14 mm"), lot(PN, "11 mm"), lot(CN, "16 mm"), lot(PN, "1.3 cm")],
    [lot(CN, "0.55 in")],
    [lot(CN, "0.7 In"), lot(CN, "0.6 IN")],
    [lot(CN, "15  mm"), lot(CN, "1.6  cm")],
    [lot(CN, "14.26 mm"), lot(CN, "15.34 mm")],
    [lot(CN, "10 mm"), lot(CN, "1 cm"), lot(CN, "0.4 in")],
    [lot(PN, ""), lot(CN, "13 mm")],
    [lot(CN, "13 mm"), lot(CN, "?"), lot(CN, "1.45 cm"), lot(CN, "0.5 in"), lot(CN, "", 4), lot(CN, "12.5mm")],
    [lot(CN, "0.6 in"), lot(CN, "15.24 mm")],
  ],
  expected: [
    {"Carabus nemoralis":{"measured":2,"min_mm":14.6,"max_mm":17,"mean_mm":15.8}},
    {"Carabus nemoralis":{"measured":2,"min_mm":15.2,"max_mm":17.8,"mean_mm":16.5}},
    {"Pterostichus niger":{"measured":2,"min_mm":12,"max_mm":13,"mean_mm":12.5}},
    {"Carabus nemoralis":{"measured":1,"min_mm":15,"max_mm":15,"mean_mm":15},"Pterostichus niger":{"measured":0,"min_mm":null,"max_mm":null,"mean_mm":null}},
    {},
    {"Carabus nemoralis":{"measured":1,"min_mm":12.7,"max_mm":12.7,"mean_mm":12.7}},
    {"Carabus nemoralis":{"measured":2,"min_mm":18,"max_mm":20,"mean_mm":19}},
    {"Pterostichus niger":{"measured":0,"min_mm":null,"max_mm":null,"mean_mm":null}},
    {"Carabus nemoralis":{"measured":2,"min_mm":14,"max_mm":16,"mean_mm":15},"Pterostichus niger":{"measured":2,"min_mm":11,"max_mm":13,"mean_mm":12}},
    {"Carabus nemoralis":{"measured":1,"min_mm":14,"max_mm":14,"mean_mm":14}},
    {"Carabus nemoralis":{"measured":2,"min_mm":15.2,"max_mm":17.8,"mean_mm":16.5}},
    {"Carabus nemoralis":{"measured":2,"min_mm":15,"max_mm":16,"mean_mm":15.5}},
    {"Carabus nemoralis":{"measured":2,"min_mm":14.3,"max_mm":15.3,"mean_mm":14.8}},
    {"Carabus nemoralis":{"measured":3,"min_mm":10,"max_mm":10.2,"mean_mm":10.1}},
    {"Pterostichus niger":{"measured":0,"min_mm":null,"max_mm":null,"mean_mm":null},"Carabus nemoralis":{"measured":1,"min_mm":13,"max_mm":13,"mean_mm":13}},
    {"Carabus nemoralis":{"measured":4,"min_mm":12.5,"max_mm":14.5,"mean_mm":13.2}},
    {"Carabus nemoralis":{"measured":2,"min_mm":15.2,"max_mm":15.2,"mean_mm":15.2}},
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  comments: [
    lena(
      "The Oregon group sent 31 sheets this week and the report has been red since Tuesday. They're volunteers; we take the sheets the way they write them.",
    ),
    mateo(
      "Heads up: the label printer calls `to_mm` directly, so whatever it learns, the labels get for free.",
    ),
  ],
  hints: [
    "There are two separate questions here: how a written length becomes millimetres, and what the report does with a lot that has no length. Each belongs to a different file.",
    {
      text: "Run `12mm` and `0.6 in` through `to_mm` on paper. What does splitting on whitespace give you for each?",
      when: { behaviour: "failing-pushes", atLeast: 3 },
    },
  ],
  team: [
    {
      id: "mateo-units-in-report",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "The inch conversion is in report.py, so the label printer still can't read `0.6 in`. Can it live in `to_mm` instead?",
        "Converting inches here only fixes the report; the label printer goes through `to_mm`. Could the conversion move to units.py?",
      ],
      when: { pattern: "25\\.4", present: true, file: "notebook/report.py" },
      repeat: "while-true",
      resolve: "explicit",
    },
  ],
  private: {
    reference: { "notebook/report.py": REPORT_REFERENCE, "notebook/units.py": UNITS_REFERENCE },
    alternatives: [
      // Units read by peeling the letters off the end, and unmeasured lots skipped inline.
      {
        "notebook/units.py": `"""Lengths as written in the notebook, converted to millimetres. The label printer uses
to_mm too."""

MM_PER = {"mm": 1, "cm": 10, "in": 25.4}


def to_mm(text):
    """'14.5 mm', '1.2 cm', '0.6 in', '12mm' or '1.3 CM' in millimetres."""
    text = text.strip().lower()
    number = text.rstrip("abcdefghijklmnopqrstuvwxyz").strip()
    unit = text[len(text.rstrip("abcdefghijklmnopqrstuvwxyz")):]
    return float(number) * MM_PER[unit]
`,
        "notebook/report.py": `"""Body lengths per species for the season report."""
from notebook.labels import parse_line
from notebook.units import to_mm


def length_report(lines):
    """Per species: how many lots were measured, and the shortest, longest and mean length in
    millimetres, each to one decimal. A species with no measured lot still appears."""
    lengths = {}
    for line in lines:
        row = parse_line(line)
        values = lengths.setdefault(row["species"], [])
        if row["length"] in ("", "?"):
            continue
        values.append(to_mm(row["length"]))
    report = {}
    for species, values in lengths.items():
        measured = len(values)
        report[species] = {
            "measured": measured,
            "min_mm": round(min(values), 1) if values else None,
            "max_mm": round(max(values), 1) if values else None,
            "mean_mm": round(sum(values) / measured, 1) if values else None,
        }
    return report
`,
      },
    ],
    wrong: [
      // Reads inches as centimetres' cousin: 2.54 instead of 25.4.
      {
        "notebook/report.py": REPORT_REFERENCE,
        "notebook/units.py": UNITS_REFERENCE.replace('"in": 25.4', '"in": 2.54'),
      },
      // Unmeasured lots dropped entirely, so their species disappears from the report.
      {
        "notebook/report.py": REPORT_REFERENCE.replace(
          '        values = lengths.setdefault(row["species"], [])\n        if row["length"] not in UNMEASURED:\n            values.append(to_mm(row["length"]))',
          '        if row["length"] not in UNMEASURED:\n            lengths.setdefault(row["species"], []).append(to_mm(row["length"]))',
        ),
        "notebook/units.py": UNITS_REFERENCE,
      },
      // Inches fixed, but a length without a space still can't be read.
      {
        "notebook/report.py": REPORT_REFERENCE,
        "notebook/units.py": UNITS_STARTER.replace('{"mm": 1, "cm": 10}', '{"mm": 1, "cm": 10, "in": 25.4}'),
      },
    ],
    examples: {
      "mateo-units-in-report": {
        fires: [{ "notebook/report.py": REPORT_CONVERTS_INCHES }],
        quiet: [
          { "notebook/report.py": REPORT_REFERENCE, "notebook/units.py": UNITS_REFERENCE },
          {},
        ],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Site summary: judge a teammate's speed-up that broke the numbers.

const SITES_STARTER = `"""Per-site totals for the season summary."""
from itertools import groupby

from notebook.labels import parse_line


def site_summary(lines):
    """Per site: lots, individuals, distinct species, and the first and last date it was
    visited."""
    # One pass instead of rescanning the notebook for every site: the export is in notebook
    # order, so each site's lines come together.
    rows = [parse_line(line) for line in lines]
    summary = {}
    for site, group in groupby(rows, key=lambda row: row["site"]):
        group = list(group)
        summary[site] = {
            "lots": len(group),
            "individuals": sum(row["count"] for row in group),
            "species": len({row["species"] for row in group}),
            "first": group[0]["date"],
            "last": group[-1]["date"],
        }
    return summary
`;

const SITES_REFERENCE = `"""Per-site totals for the season summary."""
from notebook.labels import parse_line


def site_summary(lines):
    """Per site: lots, individuals, distinct species, and the first and last date it was
    visited."""
    # One pass over the notebook. A site's lines are not together (we go back to sites all
    # season), and pages are typed up late, so dates are not in order either.
    totals = {}
    for line in lines:
        row = parse_line(line)
        site = totals.setdefault(
            row["site"],
            {"lots": 0, "individuals": 0, "species": set(), "first": row["date"], "last": row["date"]},
        )
        site["lots"] += 1
        site["individuals"] += row["count"]
        site["species"].add(row["species"])
        site["first"] = min(site["first"], row["date"])
        site["last"] = max(site["last"], row["date"])
    return {name: {**site, "species": len(site["species"])} for name, site in totals.items()}
`;

const SITES_RESCAN = `"""Per-site totals for the season summary."""
from notebook.labels import parse_line


def site_summary(lines):
    """Per site: lots, individuals, distinct species, and the first and last date it was
    visited."""
    rows = [parse_line(line) for line in lines]
    summary = {}
    for site in {row["site"] for row in rows}:
        group = [row for row in rows if row["site"] == site]
        summary[site] = {
            "lots": len(group),
            "individuals": sum(row["count"] for row in group),
            "species": len({row["species"] for row in group}),
            "first": min(row["date"] for row in group),
            "last": max(row["date"] for row in group),
        }
    return summary
`;

const SITES_SORTED = `"""Per-site totals for the season summary."""
from itertools import groupby

from notebook.labels import parse_line


def site_summary(lines):
    """Per site: lots, individuals, distinct species, and the first and last date it was
    visited."""
    rows = sorted((parse_line(line) for line in lines), key=lambda row: (row["site"], row["date"]))
    summary = {}
    for site, group in groupby(rows, key=lambda row: row["site"]):
        group = list(group)
        summary[site] = {
            "lots": len(group),
            "individuals": sum(row["count"] for row in group),
            "species": len({row["species"] for row in group}),
            "first": group[0]["date"],
            "last": group[-1]["date"],
        }
    return summary
`;

const RB = "Ridge B";
const AC = "Alder Creek";
const FM = "Fen Margin";
const AP = "Abax parallelepipedus";

const siteSummary: SeedIssue = {
  id: "site-summary-groupby",
  title: "Site summary undercounts since last week's speed-up",
  summary: "Since the season summary got faster, its per-site lots and first visits are wrong.",
  kind: "bug",
  difficulty: "medium",
  language: "python",
  skills: ["debugging", "reading-code", "iteration"],
  task: `Priya's change last week to \`notebook/sites.py\` took the season summary from 9 s to under a second on the 40,000-line export. Since then the numbers are off. From Lena:

> Ridge B shows 6 lots. We have 19 on paper, I counted them twice. And Alder Creek's first visit says June 14, but we set the traps there on May 28.

\`site_summary(lines)\` gives, per site: the number of lots, the individuals across them, the number of distinct species, and the earliest (\`first\`) and latest (\`last\`) date the site appears. Dates are written \`YYYY-MM-DD\`.

We go back to the same sites all season, and pages are often typed up days late, so the export is in the order lines were typed, not by site or by date. It needs to stay fast: going back to rescanning the notebook for every site is not an option.`,
  entry: "notebook/sites.py",
  entrypoint: "site_summary",
  starter: SITES_STARTER,
  files: [INIT, LABELS],
  inputs: [
    [row("2026-05-28", AC, CN, "14.5 mm", 2), row("2026-05-28", AC, PN, "11 mm", 1), row("2026-06-03", RB, CN, "15 mm", 3)],
    [row("2026-06-03", RB, CN, "15 mm", 2), row("2026-06-04", AC, PN, "11 mm", 1), row("2026-06-10", RB, AP, "", 4)],
    [],
    [row("2026-06-03", RB, CN, "15 mm", 1), row("2026-06-05", RB, CN, "14 mm", 2), row("2026-06-09", RB, PN, "", 1)],
    [row("2026-06-14", AC, CN, "15 mm", 1), row("2026-05-28", AC, PN, "11 mm", 2), row("2026-06-02", AC, CN, "", 1)],
    [
      row("2026-06-01", RB, CN, "", 1),
      row("2026-06-01", AC, CN, "", 1),
      row("2026-06-01", FM, PN, "", 1),
      row("2026-06-08", RB, PN, "", 2),
      row("2026-06-08", AC, CN, "", 2),
      row("2026-06-08", FM, PN, "", 2),
    ],
    [
      row("2026-06-20", RB, CN, "", 1),
      row("2026-06-02", AC, CN, "", 1),
      row("2026-06-11", RB, PN, "", 1),
      row("2026-05-30", AC, AP, "", 1),
      row("2026-06-06", RB, CN, "", 1),
    ],
    [row("2026-06-03", RB, CN, "", 0), row("2026-06-04", RB, PN, "", 2)],
    [row("2026-06-03", RB, CN, "", 1), row("2026-06-03", AC, CN, "", 1), row("2026-06-04", AC, PN, "", 1)],
    [row("2026-07-01", FM, AP, "21 mm", 1)],
    [row("2025-12-30", FM, CN, "", 1), row("2026-01-02", FM, CN, "", 1), row("2025-12-29", RB, PN, "", 1)],
    [row("2026-06-10", RB, CN, "", 1), row("2026-06-12", AC, CN, "", 1), row("2026-06-01", RB, CN, "", 1)],
    [
      row("2026-06-01", RB, CN, "", 1),
      row("2026-06-02", RB, PN, "", 2),
      row("2026-06-03", RB, AP, "", 3),
      row("2026-06-04", RB, CN, "", 4),
      row("2026-06-05", RB, PN, "", 5),
      row("2026-06-06", RB, AP, "", 6),
      row("2026-06-07", RB, CN, "", 7),
    ],
    [
      row("2026-06-01", RB, CN, "", 5),
      row("2026-06-02", AC, CN, "", 1),
      row("2026-06-03", RB, CN, "", 5),
      row("2026-06-04", AC, PN, "", 1),
      row("2026-06-05", RB, PN, "", 5),
      row("2026-06-06", AC, CN, "", 1),
    ],
    [row("2026-06-03", FM, CN, "", 1), row("2026-06-03", FM, PN, "", 1), row("2026-06-03", FM, AP, "", 1)],
    [row("2026-06-09", AC, CN, "", 1), row("2026-06-09", RB, CN, "", 1), row("2026-06-02", AC, PN, "", 3), row("2026-06-15", AC, AP, "", 1)],
    [row("2026-06-12", RB, CN, "", 2), row("2026-06-05", RB, CN, "", 1), row("2026-06-08", RB, CN, "", 1)],
  ],
  expected: [
    {"Alder Creek":{"lots":2,"individuals":3,"species":2,"first":"2026-05-28","last":"2026-05-28"},"Ridge B":{"lots":1,"individuals":3,"species":1,"first":"2026-06-03","last":"2026-06-03"}},
    {"Ridge B":{"lots":2,"individuals":6,"species":2,"first":"2026-06-03","last":"2026-06-10"},"Alder Creek":{"lots":1,"individuals":1,"species":1,"first":"2026-06-04","last":"2026-06-04"}},
    {},
    {"Ridge B":{"lots":3,"individuals":4,"species":2,"first":"2026-06-03","last":"2026-06-09"}},
    {"Alder Creek":{"lots":3,"individuals":4,"species":2,"first":"2026-05-28","last":"2026-06-14"}},
    {"Ridge B":{"lots":2,"individuals":3,"species":2,"first":"2026-06-01","last":"2026-06-08"},"Alder Creek":{"lots":2,"individuals":3,"species":1,"first":"2026-06-01","last":"2026-06-08"},"Fen Margin":{"lots":2,"individuals":3,"species":1,"first":"2026-06-01","last":"2026-06-08"}},
    {"Ridge B":{"lots":3,"individuals":3,"species":2,"first":"2026-06-06","last":"2026-06-20"},"Alder Creek":{"lots":2,"individuals":2,"species":2,"first":"2026-05-30","last":"2026-06-02"}},
    {"Ridge B":{"lots":2,"individuals":2,"species":2,"first":"2026-06-03","last":"2026-06-04"}},
    {"Ridge B":{"lots":1,"individuals":1,"species":1,"first":"2026-06-03","last":"2026-06-03"},"Alder Creek":{"lots":2,"individuals":2,"species":2,"first":"2026-06-03","last":"2026-06-04"}},
    {"Fen Margin":{"lots":1,"individuals":1,"species":1,"first":"2026-07-01","last":"2026-07-01"}},
    {"Fen Margin":{"lots":2,"individuals":2,"species":1,"first":"2025-12-30","last":"2026-01-02"},"Ridge B":{"lots":1,"individuals":1,"species":1,"first":"2025-12-29","last":"2025-12-29"}},
    {"Ridge B":{"lots":2,"individuals":2,"species":1,"first":"2026-06-01","last":"2026-06-10"},"Alder Creek":{"lots":1,"individuals":1,"species":1,"first":"2026-06-12","last":"2026-06-12"}},
    {"Ridge B":{"lots":7,"individuals":28,"species":3,"first":"2026-06-01","last":"2026-06-07"}},
    {"Ridge B":{"lots":3,"individuals":15,"species":2,"first":"2026-06-01","last":"2026-06-05"},"Alder Creek":{"lots":3,"individuals":3,"species":2,"first":"2026-06-02","last":"2026-06-06"}},
    {"Fen Margin":{"lots":3,"individuals":3,"species":3,"first":"2026-06-03","last":"2026-06-03"}},
    {"Alder Creek":{"lots":3,"individuals":5,"species":3,"first":"2026-06-02","last":"2026-06-15"},"Ridge B":{"lots":1,"individuals":1,"species":1,"first":"2026-06-09","last":"2026-06-09"}},
    {"Ridge B":{"lots":3,"individuals":4,"species":1,"first":"2026-06-05","last":"2026-06-12"}},
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  comments: [
    priya(
      "That's my change, sorry. The export used to be grouped by site and I didn't check whether it still is. Please keep it one pass if you can; the old version was what made the nightly job time out.",
    ),
    lena("The funder's mid-season report goes out Friday and it quotes these per-site numbers."),
  ],
  hints: [
    "Read the comment above the loop and check its assumption against Ridge B in the second test case.",
    {
      text: "What happens to the summary when the same site turns up in two separate stretches of the notebook? And what does the first line of a site's stretch say about its earliest date?",
      when: { behaviour: "failing-pushes", atLeast: 3 },
    },
  ],
  team: [
    {
      id: "priya-rescan",
      author: "Priya K",
      role: "Data",
      where: "review",
      severity: "blocking",
      text: [
        "This goes back to scanning every line once per site, which is what took 9 s on the season export and timed out the nightly job. Can we keep it to one pass?",
        "Filtering the whole notebook for each site is the version I replaced: fine on a page, 9 s on the season. Could it stay one pass?",
      ],
      when: { pattern: "==\\s*site\\b", present: true, file: "notebook/sites.py" },
      repeat: "while-true",
      resolve: "explicit",
    },
  ],
  private: {
    reference: { "notebook/sites.py": SITES_REFERENCE },
    // Sorting first keeps groupby and stays fast enough: n log n, not a pass per site.
    alternatives: [{ "notebook/sites.py": SITES_SORTED }],
    wrong: [
      // Fixes the dates but still restarts a site each time it turns up again.
      {
        "notebook/sites.py": SITES_STARTER.replace(
          '            "first": group[0]["date"],\n            "last": group[-1]["date"],',
          '            "first": min(row["date"] for row in group),\n            "last": max(row["date"] for row in group),',
        ),
      },
      // Groups by site, but takes first and last in typing order, not by date.
      {
        "notebook/sites.py": SITES_SORTED.replace(
          'key=lambda row: (row["site"], row["date"])',
          'key=lambda row: row["site"]',
        ),
      },
    ],
    examples: {
      "priya-rescan": {
        fires: [{ "notebook/sites.py": SITES_RESCAN }],
        quiet: [{ "notebook/sites.py": SITES_REFERENCE }, { "notebook/sites.py": SITES_SORTED }],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Ditto marks: a feature in the transcription reader.

const TRANSCRIBE_STARTER = `"""Reads typed-up notebook pages into specimen rows."""
from notebook.labels import parse_line


def read_notebook(text):
    """The specimen rows in a typed-up notebook, and the line numbers (from 1) of rows that could
    not be read. Blank lines and notes (lines starting with #) are skipped."""
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        rows.append(parse_line(line))
    return {"rows": rows, "unresolved": []}
`;

const TRANSCRIBE_REFERENCE = `"""Reads typed-up notebook pages into specimen rows."""
from notebook.labels import FIELDS, fields

# Same as the row above, as people write it on paper.
DITTO = {'"', "〃", "do."}


def read_notebook(text):
    """The specimen rows in a typed-up notebook, and the line numbers (from 1) of rows that could
    not be read. Blank lines and notes (lines starting with #) are skipped."""
    rows = []
    unresolved = []
    above = None  # the nearest specimen row above on this page, dittos resolved
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("=="):
            above = None  # a new page: the row above is on another sheet of paper
            continue
        if not stripped or stripped.startswith("#"):
            continue
        row = _resolve(fields(line), above)
        above = row
        if None in row.values():
            unresolved.append(number)
        else:
            rows.append({**row, "count": int(row["count"])})
    return {"rows": rows, "unresolved": unresolved}


def _resolve(values, above):
    """The row's fields with each ditto replaced by the field above; None where there is none."""
    row = {}
    for name, value in zip(FIELDS, values):
        if value in DITTO:
            value = above[name] if above else None
        row[name] = value
    return row
`;

/** Another design: one page at a time, dittos expanded field by field against the row above. */
const TRANSCRIBE_ALTERNATIVE = `"""Reads typed-up notebook pages into specimen rows."""
from notebook.labels import FIELDS, fields

DITTO = ('"', "〃", "do.")


def read_notebook(text):
    """The specimen rows in a typed-up notebook, and the line numbers (from 1) of rows that could
    not be read. Blank lines and notes (lines starting with #) are skipped."""
    rows, unresolved = [], []
    previous = {}
    for number, line in enumerate(text.splitlines(), start=1):
        if line.strip().startswith("=="):
            previous = {}
            continue
        if not line.strip() or line.strip().startswith("#"):
            continue
        current = {}
        for name, value in zip(FIELDS, fields(line)):
            current[name] = previous.get(name) if value in DITTO else value
        previous = current
        if any(value is None for value in current.values()):
            unresolved.append(number)
            continue
        current = dict(current)
        current["count"] = int(current["count"])
        rows.append(current)
    return {"rows": rows, "unresolved": unresolved}
`;

const TRANSCRIBE_PRINTS = TRANSCRIBE_REFERENCE.replace(
  "        row = _resolve(fields(line), above)\n",
  "        row = _resolve(fields(line), above)\n        print(number, row)\n",
);

const p14 = "== p. 14 ==";
const p15 = "== p. 15 ==";

const dittoMarks: SeedIssue = {
  id: "notebook-ditto-marks",
  title: "Volunteers have to expand ditto marks by hand",
  summary: "Expand ditto marks the way the paper notebook means them, and list the rows that can't be expanded.",
  kind: "feature",
  difficulty: "hard",
  language: "python",
  skills: ["parsing", "state", "edge-cases"],
  task: `The volunteers typing up the 2026 notebooks are expanding every ditto mark by hand, and it's slow: three of 41 notebooks done. From Marta, who leads the fieldwork:

> We've always written " under the row above when nothing changed. Some of the older volunteers write 〃 or do. Please let them type the page as it looks.

\`read_notebook(text)\` in \`notebook/transcribe.py\` reads a typed-up notebook into rows, in \`parse_line\`'s shape. It should expand ditto marks:

- A field that is exactly \`"\`, \`〃\` or \`do.\` (spaces around it don't matter) means the same field as the nearest specimen row above it on the same page, as that row reads once its own dittos are expanded.
- Blank lines and notes (lines starting with \`#\`) are skipped, as now, and don't count as the row above.
- Each notebook page starts with a heading line like \`== p. 14 ==\`. A ditto never reaches back across a heading: on paper, the row above is on another sheet.
- A row with a ditto that has nothing to copy, or that copies a field which itself had nothing to copy, can't be read. It is left out of \`rows\`, and its line number (from 1, counting every line of the text) goes in \`unresolved\` so the volunteer can fix it.`,
  entry: "notebook/transcribe.py",
  entrypoint: "read_notebook",
  starter: TRANSCRIBE_STARTER,
  files: [INIT, LABELS],
  inputs: [
    page("# p. 12, rain all morning", row("2026-06-03", RB, CN, "14.5 mm", 2), "", row("2026-06-03", RB, PN, "11 mm", 1)),
    page(row("2026-06-03", RB, CN, "14.5 mm", 2), row('"', '"', PN, "11 mm", 1), row('"', AC, CN, "", 3)),
    page(row("2026-06-04", AC, CN, "15 mm", 1), row("〃", "〃", "〃", "16 mm", "〃"), row("do.", "do.", PN, "do.", 2)),
    page(p14, row("2026-06-03", RB, CN, "14.5 mm", 2), p15, row('"', AC, CN, "15 mm", 1), row("2026-06-05", AC, PN, "", 1)),
    "",
    page(row('"', RB, CN, "14.5 mm", 1), row("2026-06-03", RB, PN, "11 mm", 1)),
    page(row("2026-06-03", RB, CN, "14.5 mm", 2), "# moved trap 3 into the shade", "", row('"', '"', PN, "11 mm", 1)),
    page(row("2026-06-03", RB, CN, "", 2), row('"', '"', PN, '"', 1)),
    page(row("2026-06-03", RB, CN, "14.5 mm", 4), row('"', '"', '"', "15 mm", '"')),
    page(p15, row('"', AC, CN, "15 mm", 1), row('"', '"', PN, "11 mm", 1), row("2026-06-05", '"', PN, "", 2)),
    page("# p. 9", "", row("2026-06-01", RB, CN, "", 1), "", "# trap 4 flooded", row('"', "Ridge C", '"', "", 1), p14, row('"', '"', '"', "", 1)),
    page(p14, row("2026-06-03", RB, CN, "", 1), row('"', '"', PN, "", 1), p15, row("2026-06-04", AC, PN, "", 2), row('"', '"', CN, "", 1)),
    page(row("2026-06-03", 'Bob\'s "big" pond', CN, "", 1), row('"', '"', "Dytiscus do. marginalis", "", 1)),
    page(p14, row('"', '"', '"', '"', '"'), row("2026-06-03", RB, CN, "", 1), row('"', '"', '"', '"', '"')),
    page(row("2026-06-03", RB, CN, "14.5 mm", 2), "  " + row('  "  ', ' 〃 ', " do. ", '"', "3")),
    page(row("2026-06-03", RB, CN, "", 1), "# moved | wet | trap 2 | gone | ?", row('"', '"', PN, "", 2)),
    page("== p. 3 ==", "== p. 4 ==", row("2026-05-20", FM, AP, "21 mm", 1), "== p. 5 ==", "# nothing today", row('"', FM, AP, "20 mm", 1)),
  ],
  expected: [
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":2},{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"11 mm","count":1}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":2},{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"11 mm","count":1},{"date":"2026-06-03","site":"Alder Creek","species":"Carabus nemoralis","length":"","count":3}],"unresolved":[]},
    {"rows":[{"date":"2026-06-04","site":"Alder Creek","species":"Carabus nemoralis","length":"15 mm","count":1},{"date":"2026-06-04","site":"Alder Creek","species":"Carabus nemoralis","length":"16 mm","count":1},{"date":"2026-06-04","site":"Alder Creek","species":"Pterostichus niger","length":"16 mm","count":2}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":2},{"date":"2026-06-05","site":"Alder Creek","species":"Pterostichus niger","length":"","count":1}],"unresolved":[4]},
    {"rows":[],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"11 mm","count":1}],"unresolved":[1]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":2},{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"11 mm","count":1}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"","count":2},{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"","count":1}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":4},{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"15 mm","count":4}],"unresolved":[]},
    {"rows":[{"date":"2026-06-05","site":"Alder Creek","species":"Pterostichus niger","length":"","count":2}],"unresolved":[2,3]},
    {"rows":[{"date":"2026-06-01","site":"Ridge B","species":"Carabus nemoralis","length":"","count":1},{"date":"2026-06-01","site":"Ridge C","species":"Carabus nemoralis","length":"","count":1}],"unresolved":[8]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"","count":1},{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"","count":1},{"date":"2026-06-04","site":"Alder Creek","species":"Pterostichus niger","length":"","count":2},{"date":"2026-06-04","site":"Alder Creek","species":"Carabus nemoralis","length":"","count":1}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Bob's \"big\" pond","species":"Carabus nemoralis","length":"","count":1},{"date":"2026-06-03","site":"Bob's \"big\" pond","species":"Dytiscus do. marginalis","length":"","count":1}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"","count":1},{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"","count":1}],"unresolved":[2]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":2},{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"14.5 mm","count":3}],"unresolved":[]},
    {"rows":[{"date":"2026-06-03","site":"Ridge B","species":"Carabus nemoralis","length":"","count":1},{"date":"2026-06-03","site":"Ridge B","species":"Pterostichus niger","length":"","count":2}],"unresolved":[]},
    {"rows":[{"date":"2026-05-20","site":"Fen Margin","species":"Abax parallelepipedus","length":"21 mm","count":1}],"unresolved":[6]},
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  comments: [
    lena(
      "Marta's group has 38 notebooks left to type up before the herbarium deadline in November. This is what's holding them up.",
    ),
    priya(
      "The unresolved line numbers go straight into the volunteers' to-fix list, so they need to match the line numbers in their editor.",
    ),
  ],
  hints: [
    "Keep hold of the last specimen row you read, as it reads after its own dittos are filled in, not as it was typed.",
    {
      text: "Look at what should count as 'the row above' after a page heading, and after a row that couldn't be read. They are different situations.",
      when: { behaviour: "failing-pushes", atLeast: 3 },
    },
  ],
  team: [
    {
      id: "priya-transcribe-print",
      author: "Priya K",
      role: "Data",
      where: "review",
      severity: "blocking",
      text: [
        "Could you take the `print` out before this goes in? The transcription job's stdout ends up in the volunteers' upload log.",
        "There's a `print` left in transcribe.py. Anything on stdout lands in the volunteers' upload log, so it needs to go before we merge.",
      ],
      when: { pattern: "^\\s*print\\(", present: true, file: "notebook/transcribe.py" },
      repeat: "while-true",
      resolve: "explicit",
    },
    {
      id: "priya-transcribe-long",
      author: "Priya K",
      role: "Data",
      where: "review",
      severity: "nit",
      text: ["Nit: `read_notebook` is doing a lot in one function. Would expanding one row's dittos read better as its own helper?"],
      when: { metric: "function-lines", above: 30, file: "notebook/transcribe.py" },
      resolve: "explicit",
    },
  ],
  private: {
    reference: { "notebook/transcribe.py": TRANSCRIBE_REFERENCE },
    alternatives: [{ "notebook/transcribe.py": TRANSCRIBE_ALTERNATIVE }],
    wrong: [
      // Copies from the row as typed, so a ditto of a ditto stays a ditto mark.
      {
        "notebook/transcribe.py": TRANSCRIBE_REFERENCE.replace(
          "        above = row\n",
          "        above = dict(zip(FIELDS, fields(line)))\n",
        ),
      },
      // Lets a ditto reach back across a page heading.
      {
        "notebook/transcribe.py": TRANSCRIBE_REFERENCE.replace(
          "            above = None  # a new page: the row above is on another sheet of paper\n",
          "",
        ),
      },
      // Counts line numbers without the skipped lines.
      {
        "notebook/transcribe.py": TRANSCRIBE_REFERENCE.replace(
          "    for number, line in enumerate(text.splitlines(), start=1):\n        stripped = line.strip()\n",
          "    number = 0\n    for line in text.splitlines():\n        stripped = line.strip()\n        if stripped and not stripped.startswith((\"#\", \"==\")):\n            number += 1\n",
        ),
      },
    ],
    examples: {
      "priya-transcribe-print": {
        fires: [{ "notebook/transcribe.py": TRANSCRIBE_PRINTS }],
        quiet: [{ "notebook/transcribe.py": TRANSCRIBE_REFERENCE }],
      },
    },
  },
};

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [speciesTally, lengthReport, siteSummary, dittoMarks];
