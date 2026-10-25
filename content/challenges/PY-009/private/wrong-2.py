# Lets a ditto reach back across a page heading.
"""Reads typed-up notebook pages into specimen rows."""

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
