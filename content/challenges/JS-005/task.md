Support escalated this from the help desk:

> A customer returned one of two jackets from an order that used **SPRING10** (10% off). The receipt says they paid **$45.00** for that jacket, but the refund came through as **$40.50**.

```text
Order #10482    SPRING10 (10% off)
  Rain jacket    1 × $50.00    −$5.00    $45.00
Refund #R-2291
  Rain jacket    1 × $50.00              −$40.50
```

`refundTotal(refund)` works out what a refund gives back. A refund must give back exactly what the customer paid for the lines returned.

**Input.** All amounts are whole cents, never floats. `refund` is `{ code, lines }`:

- `code` is the order's promo code: `null`, a percentage such as `{ percent: 10 }`, or a fixed amount in cents such as `{ amount: 500 }`.
- `lines` are the returned order lines, each `{ sku, price, quantity, discount }`. `price` is the unit price. `discount` is the part of the order's discount that checkout took off this line: at checkout the code's discount is spread over all the order's lines in proportion to their value and stored on each line.

**Output.** What the customer paid for the returned lines, as a negative number of cents: refunds stay negative all the way to the ledger. When they paid nothing for them, it is `0`.

**Helpers further down the file.** You shouldn't need to change them:

- `lineTotal(line)`: what a line charged, `price × quantity − discount` (a missing `discount` counts as 0).
- `sum(amounts)`: the sum of a list of amounts, `0` for an empty list.
- `discountFor(code, subtotal)`: a code's discount on a subtotal: `0` without a code, `Math.round(subtotal × percent / 100)` for a percentage, `amount` for a fixed amount, and never more than `subtotal`.

**Leave `orderTotal` as it is.** Checkout uses it, and it must keep taking the code's discount (`discountFor(order.code, …)`) off the order's subtotal. Keep the change to refunds.
