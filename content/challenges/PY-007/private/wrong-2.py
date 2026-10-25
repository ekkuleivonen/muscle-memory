# Keeps the last record per email instead of the first.
def dedupe(records):
    last = {}
    for record in records:
        last[record["email"].strip().lower()] = record
    return list(last.values())
