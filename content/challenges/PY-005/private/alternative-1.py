# Units read by peeling the letters off the end, and unmeasured lots skipped inline.
"""Body lengths per species for the season report."""

MM_PER = {"mm": 1, "cm": 10, "in": 25.4}
LETTERS = "abcdefghijklmnopqrstuvwxyz"


def to_mm(text):
    """'14.5 mm', '1.2 cm', '0.6 in', '12mm' or '1.3 CM' in millimetres."""
    text = text.strip().lower()
    number = text.rstrip(LETTERS).strip()
    unit = text[len(text.rstrip(LETTERS)):]
    return float(number) * MM_PER[unit]


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


# ---- labels: helpers this code uses. You shouldn't need to change them. ----

# Notebook lines, as typed up from the paper field notebook. One line per specimen lot:
#
#     2026-06-03 | Ridge B | Carabus nemoralis | 14.5 mm | 2
#
# date | site | species | body length | individuals in the lot. The length is left blank when
# nothing was measured.

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
