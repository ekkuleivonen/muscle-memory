# Groups by site, but takes first and last in typing order, not by date.
"""Per-site totals for the season summary."""
from itertools import groupby


def site_summary(lines):
    """Per site: lots, individuals, distinct species, and the first and last date it was
    visited."""
    rows = sorted((parse_line(line) for line in lines), key=lambda row: row["site"])
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
