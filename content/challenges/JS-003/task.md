Since the cart moved to integer cents, the cart drawer shows amounts the way the API stores them. From a support ticket:

> My cart says the sofa costs **129900**. Is that dollars?? And my refund line says **-500**.

`formatPrice(cents)` takes an amount as a whole number of cents and returns the text the drawer, the receipts and the refund lines show.

- Show a dollar sign, then the whole dollars with a comma between every group of three digits, then a dot and exactly two digits of cents: `123456` → `"$1,234.56"`, `5` → `"$0.05"`.
- Negative amounts are refunds. The minus goes before the dollar sign, as on the receipts: `-500` → `"-$5.00"`.
- Amounts can run into the billions of cents.
