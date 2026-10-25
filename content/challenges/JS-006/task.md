The cart drawer and the header badge show whatever `Cart.summary()` returns. To keep the drawer fast, `summary()` was memoised: the drawer calls it on every render, and repricing a 60-line cart each time cost 38 ms a frame (now about 2). Since then the drawer sometimes shows an old total. A shopper's report:

> I changed the jeans from 1 to 2 in my cart and it still said $59.00. Then checkout charged me $118.00.

Removing an item shows the right total; changing a quantity doesn't. Make every `summary()` reflect the cart as it is at that moment, and keep the memo.

**What `summary()` returns.** `{ items, subtotal, discount, total }`, amounts in whole cents: `items` is the sum of the lines' quantities, `subtotal` the sum of `price × quantity`, `discount` the promo code's discount on the subtotal, and `total` is `subtotal − discount`.

**The cart.**

- `add(sku, price, quantity = 1)` adds that quantity to the line with that SKU, or adds a new line `{ sku, price, quantity }` if there is none. Adding to an existing line keeps the line's price.
- `setQuantity(sku, quantity)` sets a line's quantity; 0 or less removes the line. It does nothing for a SKU not in the cart.
- `remove(sku)` removes the line.
- `applyCode(code)` sets the promo code: `{ name, percent }`, `{ name, amount }` (in cents), or `null` to remove it. Two codes can share a name and differ in what they take off.

**Discounts.** `discountFor(code, subtotal)`, further down the file, is 0 without a code; a percent code takes `Math.round(subtotal × percent / 100)`, an amount code takes its amount, and the discount is never more than the subtotal. `sum(amounts)` adds up an array of numbers.

**The memo stays.** `summary()` must not reprice the cart when nothing changed since the last call. Keep the result cached in a field on the cart named for what it does (the starter's `this.cache`, or for example a version number or a dirty flag) rather than taking the memo out.

**Tests.** `replay(actions)` plays a session on a new cart and returns what `summary()` showed each time it was asked. Actions are `["add", sku, price, quantity?]`, `["quantity", sku, quantity]`, `["remove", sku]`, `["code", code]` and `["summary"]`.
