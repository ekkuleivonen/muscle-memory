def dedupe(records):
    keys = [record["email"].strip().lower() for record in records]
    return [record for i, record in enumerate(records) if keys[i] not in keys[:i]]
