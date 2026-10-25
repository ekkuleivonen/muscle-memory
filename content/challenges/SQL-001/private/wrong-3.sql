-- Drops zero and negative totals, but adjustments are part of the sum and a customer with only a 0 order still has a row.
-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, SUM(total) AS revenue
FROM orders
WHERE total > 0
GROUP BY customer
ORDER BY revenue DESC;
