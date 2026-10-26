"""Body lengths per species for the season report."""
import re

MM_PER = {"mm": 1, "cm": 10, "in": 25.4}


def to_mm(text):
    text = text.strip()
    if text in ("", "?"):
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(mm|cm|in)", text, re.IGNORECASE)
    if match is None:
        raise ValueError(f"not a length: {text!r}")
    return float(match.group(1)) * MM_PER[match.group(2).lower()]


def length_report(lines):
    lengths = {}
    for line in lines:
        row = parse_line(line)
        values = lengths.setdefault(row["species"], [])
        value = to_mm(row["length"])
        if value is not None:
            values.extend([value] * row["count"])
    return {
        species: {
            "measured": len(values),
            "min_mm": round(min(values), 1) if values else None,
            "max_mm": round(max(values), 1) if values else None,
            "mean_mm": round(sum(values) / len(values), 1) if values else None,
        }
        for species, values in lengths.items()
    }

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
