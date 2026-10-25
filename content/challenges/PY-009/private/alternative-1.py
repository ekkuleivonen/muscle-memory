"""Reads typed-up notebook pages into specimen rows."""

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
