def dedupe(records):
    """Keep the first record for each email before the newsletter sync.

    Emails compare case-insensitively, ignoring surrounding spaces. Order is kept.
    """
    seen = set()
    kept = []
    for record in records:
        key = record["email"].strip().lower()
        if key not in seen:
            seen.add(key)
            kept.append(record)
    return kept
