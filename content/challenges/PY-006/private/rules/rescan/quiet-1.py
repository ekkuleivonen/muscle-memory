"""Per-site totals for the season summary."""


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
