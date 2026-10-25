# Writes the normalised email back into the record.
def dedupe(records):
    seen, kept = set(), []
    for record in records:
        email = record["email"].strip().lower()
        if email not in seen:
            seen.add(email)
            kept.append({**record, "email": email})
    return kept
