Merge closed intervals that overlap or share an endpoint, then return them sorted by start.

Implement `std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>>& intervals)`. Each interval is [start, end] with start <= end, both in -1000..1000. Input may be unsorted, contain duplicates, nested intervals or zero-length intervals; at most 100 intervals. Empty input returns []. Intervals [1,2] and [3,4] do not overlap.

## Examples

Input: `[[5, 7], [1, 3], [3, 6]]` → output: `[[1, 7]]`.
Input: `[]` → output: `[]`.
