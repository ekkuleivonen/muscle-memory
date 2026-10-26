def dedupe(records):
    keys = [record["email"].strip().casefold() for record in records]
    return [record for i, record in enumerate(records) if keys[i] not in keys[:i]]
