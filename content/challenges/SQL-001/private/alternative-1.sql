-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT DISTINCT customer, SUM(total) OVER (PARTITION BY customer) AS revenue
FROM orders
ORDER BY revenue DESC, customer;
