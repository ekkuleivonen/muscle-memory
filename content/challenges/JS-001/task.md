Kettlebrook's checkout has been failing since Thursday's release, which shipped CHK-412 (free shipping from $30 for loyalty members). Every customer checking out as a guest gets "Something went wrong" on the payment page instead of a quote: `POST /quote` returns 500 with `TypeError: Cannot read properties of undefined (reading 'tier')` thrown in `quoteOrder`. Members' orders still get quotes. For example, guest order #88213 (two stoneware mugs at $18.00 each) failed.

Fix `quoteOrder` so that every order gets a correct quote.

## Input and output

`quoteOrder(order)` takes an order and returns `{ subtotal, shipping, total }`, all whole cents (never floats); the payment page charges exactly that.

- `order.items` is a list of `{ sku, price, quantity }`, with `price` in cents. `subtotal` is the sum of `price × quantity` over the items.
- `order.customer` is either a guest, `{ guest: true }`, which has no loyalty record at all, or a member, `{ id, loyalty: { tier } }`, where `tier` is a string such as `"silver"`, `"gold"` or `"none"`.
- `total` is `subtotal + shipping`.

## Shipping rules

- Standard shipping is $4.95 (495 cents).
- Shipping is free for everyone when the subtotal is $50.00 (5000 cents) or more.
- A loyalty member gets free shipping when the subtotal is $30.00 (3000 cents) or more. A loyalty member is a customer with a loyalty record whose tier is not `"none"`.
- A guest is not a loyalty member. A member whose tier is `"none"` has lapsed and is not a loyalty member either: both get the standard $50 threshold.

## Code you can use

The starter imports these; their code is fixed and you cannot change it:

- `lineTotal(item)` returns `item.price * item.quantity`; `sum(amounts)` adds a list of numbers (0 for an empty list).
- `shippingFor(subtotal, member)` returns the shipping in cents under the rules above: 0 when `subtotal` is at least 3000 if `member` is `true`, or at least 5000 if it is `false`; 495 otherwise. The module also exports the constants `SHIPPING` (495), `FREE_FROM` (5000) and `MEMBER_FREE_FROM` (3000).

## Constraints

- Handle guests and lapsed members explicitly. Do not use `catch` (no `try`/`catch` and no `.catch(`): catching the error would turn the crash into a silently wrong quote.
