Rui sent this after reconciling September:

> The collected-by-partner report says Northwind paid us **$1,284.00** in September. Their remittances add up to **$942.00**. And Corvid isn't on the report at all. They're the one I need to chase: they haven't paid a cent since August.

Northwind moved its bigger customers onto two-part invoices in August, so some orders now have more than one payment, and some are only partly paid so far.

Fix the collected-by-partner query. It reads two tables:

| Table | Column | Type | Meaning |
| --- | --- | --- | --- |
| `orders` | `id` | `integer`, primary key | the order |
| `orders` | `partner` | `text`, not null | the partner the order came through |
| `orders` | `total` | `numeric(12, 2)`, not null | what the order was invoiced for |
| `payments` | `id` | `integer`, primary key | the payment |
| `payments` | `order_id` | `integer`, not null, references `orders (id)` | the order it pays for |
| `payments` | `amount` | `numeric(12, 2)`, not null | the amount received |

An order can have no payments, one, or several, and its payments need not add up to its total.

The query returns one row per partner that has at least one order, with two columns:

1. `partner`;
2. `collected`: the sum of every payment received on that partner's orders, or `0` when none of them has been paid.

Rows are ordered by `collected`, biggest first; partners with the same amount are in alphabetical order, so the PDF doesn't reshuffle every month. With no orders the result has no rows.

Requirement: every payment counts. Two payments of the same amount are two payments, so don't add up only the distinct amounts.
