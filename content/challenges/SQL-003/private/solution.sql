-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT o.id
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE p.order_id IS NULL
ORDER BY o.id;
