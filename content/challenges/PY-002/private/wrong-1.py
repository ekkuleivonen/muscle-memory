# Folds case: A3 and a3 become one trap.
def frequency_map(items):
    counts = {}
    for item in items:
        key = item.lower()
        counts[key] = counts.get(key, 0) + 1
    return counts
