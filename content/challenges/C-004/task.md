Copy every value other than the chosen target into the output, preserving order.

Implement `size_t remove_value(const int *values, size_t count, int target, int *out)`, returning how many values were copied. `out` has room for `count` integers. Empty input and removing all values produce an empty output. Input has at most 200 integers in -10000..10000; target is in the same range. Do not modify the input.

## Examples

Input: `[[2, 1, 2, 3], 2]` → output: `[1, 3]`.
Input: `[[], 0]` → output: `[]`.
