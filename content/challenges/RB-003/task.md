Group an ascending list of distinct integers into maximal consecutive runs.

Implement `group_runs(values)`, returning a list of lists. A run continues only when the next integer is exactly one greater. Preserve order. Empty input returns []. At most 200 distinct integers in -10000..10000, already sorted; do not change the input.

## Examples

Input: `[1, 2, 3, 7, 8, 10]` → output: `[[1, 2, 3], [7, 8], [10]]`.
Input: `[]` → output: `[]`.
