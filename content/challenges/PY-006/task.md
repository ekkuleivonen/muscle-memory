Last week's change to `site_summary` took the season summary from 9 s to under a second on the 40,000-line export. Since then the numbers are wrong. From Lena:

> Ridge B shows 6 lots. We have 19 on paper, I counted them twice. And Alder Creek's first visit says June 14, but we set the traps there on May 28.

`site_summary(lines)` takes the season's notebook lines (a list of strings, one specimen lot each) and returns a dict keyed by site name. For each site:

- `lots`: how many lines are for that site;
- `individuals`: the sum of their counts;
- `species`: how many distinct species names they have, compared exactly as written;
- `first` and `last`: the earliest and latest date the site appears, as written. Dates are `YYYY-MM-DD`.

A line reads `date | site | species | length | count`, for example `2026-06-03 | Ridge B | Carabus nemoralis | 14.5 mm | 2`. `parse_line(line)`, further down the file, returns it as a dict with the keys `date`, `site`, `species` and `length` (strings, stripped of surrounding spaces) and `count` (an int).

The lines are in the order they were typed up, which is neither grouped by site nor sorted by date: the team goes back to the same sites all season, and pages are often typed up days late. No lines gives `{}`.

Requirement: it must stay fast. Don't go over all the lines once for each site.
