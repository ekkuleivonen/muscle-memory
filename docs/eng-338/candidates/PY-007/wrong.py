def dedupe(records):
    """Keep the first record for each email, preserving records and order."""
    seen = set()
    result = []
    for record in records:
        key = record["email"].strip().lower()
        if key not in seen:
            seen.add(key)
            result.append(record)
    return result
