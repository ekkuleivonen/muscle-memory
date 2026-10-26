-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT o.id
FROM orders o
WHERE NOT EXISTS (
  SELECT 1
  FROM payments p
  WHERE p.order_id = o.id AND p.amount > 0
)
ORDER BY o.id ASC;
