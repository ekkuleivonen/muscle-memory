Finance's September sales-tax filing came out $310.22 under the tax customers were actually charged. The filing is the sum of what `lineTaxes` returns for every order, and those line taxes don't add up to the order's tax. A receipt also charged tax on a gift card.

One order, at 8.25%, as the receipt shows it today:

```text
Order #20417                      net      tax
  Rain jacket                  $45.00    $3.71
  Tee × 2                      $45.00    $3.71
  Socks                        $10.80    $0.89
  Tax                                    $8.32   ← the lines add up to $8.31
```

Fix `receipt(order)` and `lineTaxes(amounts, rate)` so they follow Finance's rules. All amounts are whole cents; rates are basis points (825 is 8.25%).

**Input.** An `Order` is `{ id, taxRate, lines }`. Each line is `{ sku, price, quantity, discount, taxable }`: `price` is per unit, `discount` is the line's share of the order's promo code, and `taxable` is `false` for gift cards and donations.

**Output.** A `Receipt` is `{ lines, net, tax, total }`, where `lines` has one `{ sku, net, tax }` per order line, in order.

**Rules.**

- A line's `net` is `price × quantity − discount`. The receipt's `net` is the sum of every line's net, gift cards included.
- A line's taxable amount is its net when `taxable` is `true`, and 0 when it is `false`. A non-taxable line's tax is 0.
- The order is taxed once: the sum of the taxable amounts times the rate, divided by 10,000 and rounded half up to the cent. That is the receipt's `tax`, and `total` is `net + tax`.
- The line taxes add up to exactly the order's tax. Each line first gets its taxable amount times the rate, divided by 10,000 and rounded down. The cents still missing go one each to the lines with the largest remainders from that division; on a tie, the earlier line gets the cent first.
- `lineTaxes(amounts, rate)` takes the lines' taxable amounts in order and returns each line's tax by the rule above. Keep it exported with that signature (the finance export calls it with the taxable amounts) and take the receipt's line taxes from it.
- Keep money in whole cents: no `toFixed` or `parseFloat`.

`taxOn(amount, rate)` in the file is the tax on one amount, rounded half up to the cent.
