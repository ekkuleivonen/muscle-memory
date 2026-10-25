The monthly report needs revenue by customer. Write the query.

The database (PostgreSQL) has one table, `orders`, with one row per order:

| column | type | meaning |
| --- | --- | --- |
| `id` | `integer`, primary key | the order's id |
| `customer` | `text`, not null | the customer's name |
| `total` | `integer`, not null | the order's total; can be 0, or negative for an adjustment |

Return one row per customer who has orders, with two columns in this order: the customer's name, and the sum of the totals of their orders. Order the rows by that sum, highest first. Column names don't matter. Names match exactly as written, and a sum can be larger than a 32-bit integer holds. No orders gives no rows.
