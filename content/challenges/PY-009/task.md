The volunteers typing up the 2026 notebooks are expanding every ditto mark by hand, and it's slow: three of 41 notebooks done. From Marta, who leads the fieldwork:

> We've always written " under the row above when nothing changed. Some of the older volunteers write 〃 or do. Please let them type the page as it looks.

`read_notebook(text)` reads a typed-up notebook (one string, lines separated by newlines) and returns `{"rows": [...], "unresolved": [...]}`.

**Lines.** A specimen row reads `date | site | species | length | count`, for example `2026-06-03 | Ridge B | Carabus nemoralis | 14.5 mm | 2`. Three kinds of line are not specimen rows: blank lines (empty or only whitespace), notes (starting with `#` once leading spaces are removed), and page headings (starting with `==`, for example `== p. 14 ==`).

**Rows.** Each specimen row becomes a dict with the keys `date`, `site`, `species` and `length` (strings, stripped of surrounding spaces) and `count` (an int), in the order the rows appear. The helpers further down the file provide:

- `parse_line(line)`: that dict for one line, with no ditto expansion;
- `fields(line)`: the line's five fields as a list of stripped strings, in that order (raises `ValueError` if there aren't five);
- `FIELDS`: the field names, `("date", "site", "species", "length", "count")`.

**Ditto marks.**

- A field that is exactly `"`, `〃` or `do.` once stripped is a ditto. A field that only contains one of them among other text is not.
- A ditto means the same field as the nearest specimen row above it on the same page, as that row reads once its own dittos are expanded. This applies to every field, the count included.
- Blank lines and notes are skipped and are never the row above.
- A page heading starts a new sheet of paper: a ditto never reaches back across it. The first row after a heading has no row above.
- A ditto with nothing to copy (no row above, or the field above was itself a ditto with nothing to copy) can't be resolved. Its row can't be read: it is left out of `rows`, and its line number goes in `unresolved`. It still counts as the row above for the next row, whose dittos copy the fields it had and can't resolve the ones it didn't.
- Line numbers start at 1 and count every line of the text, including blank lines, notes and headings, so they match the line numbers in the volunteer's editor. `unresolved` lists them in order.

Empty text gives `{"rows": [], "unresolved": []}`.

Requirement: the code must not print anything. The transcription job's standard output goes into the volunteers' upload log.
