# Tidies labels: blanks dropped and spaces trimmed, so the relabelling list loses them.
def frequency_map(items):
    counts = {}
    for item in items:
        key = item.strip()
        if key:
            counts[key] = counts.get(key, 0) + 1
    return counts
