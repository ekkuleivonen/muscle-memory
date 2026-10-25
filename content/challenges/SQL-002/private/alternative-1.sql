-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
WITH paid AS (
  SELECT order_id, SUM(amount) AS amount
  FROM payments
  GROUP BY order_id
)
SELECT o.partner, SUM(COALESCE(paid.amount, 0)) AS collected
FROM orders o
LEFT JOIN paid ON paid.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC, o.partner;
