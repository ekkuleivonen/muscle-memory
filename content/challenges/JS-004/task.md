Write `shippingBanner(order)`: the text of the banner above the checkout button in the cart drawer, telling the shopper how far the cart is from free shipping, or `null` when there is no banner.

**Input.** An order is `{ code, lines }`. Each line is `{ sku, price, quantity }`, with `price` per unit in whole cents. `code` is the promo code: `null`, a percentage (`{ percent: 10 }`) or a fixed amount in cents (`{ amount: 500 }`).

**Output.** Use this copy exactly:

| Cart | Banner |
|---|---|
| no lines | `null` |
| total under $50.00 | `Spend $12.50 more for free shipping` (the amount still missing) |
| total of $50.00 or more | `Your order ships free` |

**Rules.**

- The total is what checkout charges for the lines after the promo code, the same total `shippingFor(order)` in the file compares with `FREE_SHIPPING_FROM` (5000 cents). The banner must never promise free shipping that checkout then charges for, or ask for more when checkout already ships free.
- A cart is empty only when it has no lines. A cart with lines whose total is $0.00 still shows how much more to spend.
- Amounts read as everywhere else in the cart: a dollar sign, whole dollars with commas between thousands, a dot and two digits of cents, as in `$1,234.56` and `$0.05`.

**Code you can use**, further down the file:

- `orderTotal(order)` returns the total in cents: the sum of `price × quantity` over the lines, less the code's discount. A percentage code takes `Math.round(subtotal × percent / 100)` off; an amount code takes its amount off; either way the discount is never more than the subtotal, so the total is never below 0.
- `formatPrice(cents)` formats cents as above: `formatPrice(123456)` is `"$1,234.56"`.
