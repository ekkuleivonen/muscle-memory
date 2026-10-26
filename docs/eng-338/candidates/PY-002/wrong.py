def frequency_map(items):
    counts = {}
    for item in items:
        item = item.lower()
        counts[item] = counts.get(item, 0) + 1
    return counts
