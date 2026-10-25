"""Individuals per species for the end-of-day tally sheet."""


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


# ---- names: helpers this code uses. You shouldn't need to change them. ----

# Species names the way the herbarium database files them.


def canonical_name(name):
    """'  carabus   NEMORALIS ' -> 'Carabus nemoralis': the genus capitalised, everything after
    it lowercase, one space between words."""
    words = name.split()
    if not words:
        return ""
    return " ".join([words[0].capitalize()] + [word.lower() for word in words[1:]])
