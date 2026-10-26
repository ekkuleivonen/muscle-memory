-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, SUM(total) AS revenue
FROM orders
WHERE total > 0
GROUP BY customer
ORDER BY revenue DESC, customer ASC;
