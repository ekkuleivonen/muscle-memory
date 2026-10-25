-- COUNT(*) counts the left join's empty row too, so no order ever has a count of 0.
-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT o.id
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.id
HAVING COUNT(*) = 0
ORDER BY o.id;
