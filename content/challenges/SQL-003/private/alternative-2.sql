-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT id FROM orders
EXCEPT
SELECT order_id FROM payments
ORDER BY 1;
