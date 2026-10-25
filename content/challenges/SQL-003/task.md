Before the month-end close, finance needs the orders nobody has paid for. Write the query.

The database (PostgreSQL) has two tables:

| table | column | type | meaning |
| --- | --- | --- | --- |
| `orders` | `id` | `integer`, primary key | the order's id |
| `orders` | `customer` | `text`, not null | the customer's name |
| `payments` | `order_id` | `integer`, not null, references `orders (id)` | the order the payment is for |
| `payments` | `amount` | `integer`, not null | the amount paid |

`payments` has one row per payment, and an order can have any number of payments, including none.

Return one column, the order's `id`, with one row for each order that has no payment at all, smallest id first. Any payment counts, whatever its amount, and each unpaid order appears once. Column names don't matter. No unpaid orders gives no rows.
