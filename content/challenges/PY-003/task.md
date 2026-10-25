Monday's import into the herbarium database created 14 "new" species that it already had. From the import log:

```text
new species: Carabus Nemoralis        (have: Carabus nemoralis)
new species: Carabus Sp.              (have: Carabus sp.)
new species: Pterostichus Niger       (have: Pterostichus niger)
```

The import matches species names exactly, so every name on the end-of-day tally sheet must be written the way the herbarium writes it.

`species_tally(lines)` takes the day's notebook lines (a list of strings) and returns a dict from species name to the total number of individuals of that species.

- A line reads `date | site | species | length | count`, for example `2026-06-03 | Ridge B | Carabus nemoralis | 14.5 mm | 2`. `parse_line(line)`, further down the file, returns it as a dict with the keys `date`, `site`, `species` and `length` (strings, stripped of surrounding spaces) and `count` (an int).
- Lines that are empty or only whitespace are skipped.
- Each species is keyed by its herbarium name, which `canonical_name(name)`, further down the file, returns: it splits the name on whitespace, capitalises the first word (first letter upper case, the rest lower case), lowercases every other word, and joins the words with single spaces. `"  leistus   FERRUGINEUS "` becomes `"Leistus ferrugineus"`; a name with no words becomes `""`.
- Lines whose species have the same herbarium name are one species: their counts add up.
- Every species on a non-blank line is in the result, even when its total is 0. No lines gives `{}`.

Requirement: the names must come from `canonical_name` itself, not from a naming rule of your own, so the tally sheet and the herbarium can't drift apart again.
