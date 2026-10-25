Each night the vial scanner reads the label on every vial that came back from the field, and the nightly sheet lists how many vials carry each label. The counting step was never finished, so the sheet comes out empty:

```text
nightly sheet 2026-06-04: 212 vials scanned, 0 labels counted
```

`frequency_map(items)` gets the night's labels as a list of strings, one per vial, and returns a dict that maps each distinct label to the number of vials that carry it.

- Count every label exactly as the scanner read it. Labels are case-sensitive (`A3` and `a3` are different traps), and spaces, blank labels and odd strings read off smudged labels (such as `__proto__`) are labels like any other: they tell the team which vials to relabel by hand.
- No vials gives `{}`.
- Don't print anything: the scanner job ships everything on stdout to the warehouse logs.
