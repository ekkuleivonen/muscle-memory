Security raised the minimum password length to 12, and the sign-up form says 12, but the API still checks 8 and reports no other rule.

`PasswordPolicy.violations(password)` returns every rule the password breaks, in this order:

1. `"too-short"`: fewer than 12 characters. Every character counts, whitespace included.
2. `"no-digit"`: no digit.
3. `"no-letter"`: no letter, in either case.
4. `"has-whitespace"`: a space, tab or other whitespace character anywhere.

Length means Java UTF-16 code units (`String.length()`). For each code unit, use Java’s `Character.isDigit`, `Character.isLetter` and `Character.isWhitespace` definitions; letters and digits are not limited to ASCII.

A password that breaks none of them gets an empty list.
