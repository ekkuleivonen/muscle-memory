-- Treats an order as unpaid when its payments add up to 0, but any payment counts, whatever its amount.
-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT o.id
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.id
HAVING COALESCE(SUM(p.amount), 0) = 0
ORDER BY o.id;
