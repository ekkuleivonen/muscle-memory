Return whether a string is a valid ISBN-10.

Implement `validIsbn(string $text): bool`. Accept exactly 10 characters with no spaces or hyphens: the first nine must be ASCII digits, and the last a digit or uppercase X (value 10). Multiply their values by weights 10,9,...,1; the sum must be divisible by 11. Reject lowercase x, wrong lengths and other characters. Input is ASCII, at most 30 characters.

## Examples

Input: `"0306406152"` → output: `true`.
Input: `"080442957X"` → output: `true`.
