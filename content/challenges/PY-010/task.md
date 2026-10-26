Rui escalated Bluefin's October reconciliation:

> Bluefin's statement for 3 October says we're owed **€59.50** on 2 orders. Our settlement report says **€75.00** with **2 rejected rows**. Every night since 1 October has had rejected rows, always Bluefin's. Northwind still matches to the cent.

Bluefin's partner note from 28 September:

> From 1 October our settlement exports write negative amounts in accounting format: refunds and fees appear in brackets, e.g. `(12.50)`.

Their file for 3 October:

```text
partner,order_id,type,amount,currency
Bluefin,BF-77101,sale,45.00,EUR
Bluefin,BF-77102,sale,30.00,EUR
Bluefin,BF-77101,refund,(12.50),EUR
Bluefin,BF-FEE-10,adjustment,(3.00),EUR
```

`settlement_summary(text)` is what finance reconciles each partner's statement against. It takes a settlement export as CSV text, with the header `partner,order_id,type,amount,currency`, and returns `{"partners": [...], "rejected": n}`.

**Reading rows.** Each row of the export is read as follows. (In the starter, `read_settlements(text)` does the reading; only `settlement_summary`'s result is checked.)

- `partner` and `order` are trimmed; `currency` is trimmed and upper-cased.
- The type is trimmed and lower-cased, and must be `sale`, `refund` or `adjustment`; any other type rejects the row.
- An amount is read in whole cents. A plain amount is read by `to_cents(text)`, further down the file: a decimal number with an optional sign and at most two decimal places, with surrounding whitespace allowed (`"12.50"`, `"-3"`, `" 7.05 "`), becomes cents (`1250`, `-300`, `705`); anything else, including an empty string, `NaN`, exponent notation or more than two decimal places (even trailing zeros), raises `ValueError`. An amount in brackets, with surrounding whitespace allowed, is an accounting negative: `(12.50)` is `-1250`. What's inside the brackets must itself be a plain amount. Brackets mean its negative magnitude: `(-3.00)` is also `-300` cents.
- A row whose amount can't be read is rejected: counted and left out, never guessed at. Only a bad type or a bad amount rejects a row; anything else wrong with the file (a missing column, say) is an error, not a rejected row.

**Summary.** One entry per partner and currency, as `{"partner", "currency", "sales", "refunds", "net"}`, sorted by partner and then currency:

- `sales` and `refunds` count the rows of each kind (adjustments aren't counted).
- `net` in cents is sales less refunds, plus adjustments (fees, corrections) with their own sign. A refund always reduces net by its size, whichever way the partner writes it: Northwind writes refunds as positive amounts, Bluefin in brackets.

`rejected` is the number of rejected rows, so nobody signs off on a partial file. A file with only the header gives `{"partners": [], "rejected": 0}`.
