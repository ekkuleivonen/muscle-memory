# A dict keeps the first record per email, in insertion order.
def dedupe(records):
    first = {}
    for record in records:
        first.setdefault(record["email"].strip().casefold(), record)
    return list(first.values())
