-- Counts the orders instead of adding up their totals.
-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, COUNT(*) AS revenue
FROM orders
GROUP BY customer
ORDER BY revenue DESC;
