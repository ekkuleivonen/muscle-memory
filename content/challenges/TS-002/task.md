Customers type promo codes the way they read them in the email, and checkout rejects codes typed in lowercase or with stray spaces.

`applyDiscount(totalCents, code, codes)` returns an order's total after its promo code's discount.

- `totalCents` is the total in whole cents. `code` is what the customer typed. `codes` maps each configured code to its percent off, from 0 to 100: `{ SAVE10: 10 }`.
- The typed code matches a configured code when the two are equal ignoring letter case and ignoring spaces before and after the typed code. Spaces inside a code still count, and configured codes may be written in any case. Only codes in `codes` match.
- With a match, return the total less that percentage, rounded down to whole cents.
- Without a match, including an empty or blank code, return the total unchanged.
