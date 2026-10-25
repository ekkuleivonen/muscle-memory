`frequency_map(items)` gets a list of strings and returns a dict that maps each distinct string to how many times it appears. The starter returns an empty dict.

```python
frequency_map(["A3", "b7", "A3", "a3"])  # {"A3": 2, "b7": 1, "a3": 1}
```

- Count every string exactly as written: matching is case-sensitive (`A3` and `a3` are different), and spaces, empty strings and odd strings (such as `__proto__`) are counted like any other.
- An empty list gives `{}`.
- Don't print anything.
