Encode each consecutive run as its character followed by its decimal length.

Implement `Solution.Encode(string text)`. Input contains only ASCII letters A-Z and a-z, at most 200 characters. Case matters. Always write a count, including 1; an empty string returns an empty string. Runs longer than 9 use all digits of the count.

## Examples

Input: `"aaabbA"` → output: `"a3b2A1"`.
Input: `""` → output: `""`.
