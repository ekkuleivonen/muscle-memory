"""Body lengths per species for the season report."""

MM_PER = {"mm": 1, "cm": 10}


def to_mm(text):
    """'14.5 mm' or '1.2 cm' in millimetres."""
    value, unit = text.split()
    return float(value) * MM_PER[unit]


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
