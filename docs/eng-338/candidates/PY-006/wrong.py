"""Per-site totals for the season summary."""


def site_summary(lines):
    summary = {}
    species_seen = {}
    for line in lines:
        row = parse_line(line)
        site = row["site"]
        date = row["date"]
        if site not in summary:
            summary[site] = {"lots": 0, "individuals": 0, "species": 0,
                             "first": date, "last": date}
            species_seen[site] = set()
        total = summary[site]
        total["lots"] += 1
        total["individuals"] += row["count"]
        species_seen[site].add(row["species"])
        total["species"] = len(species_seen[site])
        total["first"] = min(total["first"], date)
        total["last"] = date
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
