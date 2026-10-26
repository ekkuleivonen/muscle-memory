"""Reads typed-up notebook pages into specimen rows."""


def read_notebook(text):
    rows = []
    unresolved = []
    previous = None
    dittos = {'"', '〃', 'do.'}
    for line_number, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        if stripped.startswith('=='):
            previous = None
            continue
        current = fields(line)
        for index, value in enumerate(current):
            if value in dittos:
                current[index] = None if previous is None else previous[index]
        previous = current
        if any(value is None for value in current):
            unresolved.append(line_number)
            continue
        row = dict(zip(FIELDS, current))
        row['count'] = int(row['count'])
        rows.append(row)
    return {'rows': rows, 'unresolved': unresolved}

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
