-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, SUM(total) AS revenue
FROM orders
GROUP BY customer
ORDER BY revenue DESC, customer ASC;
