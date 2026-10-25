-- SUM(DISTINCT ...) adds each different total once, so three 15s count as 15.
-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, SUM(DISTINCT total) AS revenue
FROM orders
GROUP BY customer
ORDER BY revenue DESC;
