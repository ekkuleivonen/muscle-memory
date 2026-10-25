# Matches case-insensitively but not across surrounding spaces.
def dedupe(records):
    seen, kept = set(), []
    for record in records:
        key = record["email"].lower()
        if key not in seen:
            seen.add(key)
            kept.append(record)
    return kept
