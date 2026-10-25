The season report fails as soon as it reaches the sheets from the Oregon volunteers:

```text
  File "report.py", line 9, in to_mm
    return float(value) * MM_PER[unit]
KeyError: 'in'
```

Their sheets differ from ours: lengths can be in inches (`0.6 in`), sometimes with no space before the unit or with the unit in capitals (`12mm`, `1.3 CM`, `0.5in`), and lots nobody measured have the length left blank, or a `?` when the volunteer wasn't sure. We take the sheets the way the volunteers write them.

`length_report(lines)` takes the season's notebook lines (a list of strings, one specimen lot each) and returns a dict keyed by species name, exactly as written on the line. For each species:

- `measured`: how many of its lots have a length. Each lot counts once, whatever its individual count.
- `min_mm`, `max_mm`, `mean_mm`: the shortest, longest and mean of those lengths in millimetres, each rounded to one decimal (the mean is taken over the unrounded lengths).

A line reads `date | site | species | length | count`, for example `2026-06-03 | Ridge B | Carabus nemoralis | 14.5 mm | 2`. `parse_line(line)`, further down the file, returns it as a dict with the keys `date`, `site`, `species` and `length` (strings, stripped of surrounding spaces) and `count` (an int).

A length is a number (digits, optionally with a decimal part), then any amount of space or none, then a unit: `mm`, `cm` (10 mm) or `in` (25.4 mm), in any mix of upper and lower case. A blank length or `?` means the lot wasn't measured: it doesn't count towards any of the numbers, but its species still appears. A species with no measured lot shows `measured: 0` and `None` for the three lengths. No lines gives `{}`.
