Shift each ASCII letter around its alphabet by offset positions, preserving case.

Implement `Solution.shift(String text, int offset)`. Wrap z to a and Z to A. Negative offsets shift backward. Leave spaces, digits and punctuation unchanged. Input has at most 200 ASCII characters; offset is -10000..10000. Empty input returns an empty string.

## Examples

Input: `["Az-9!", 1]` → output: `"Ba-9!"`.
Input: `["abc", -1]` → output: `"zab"`.
