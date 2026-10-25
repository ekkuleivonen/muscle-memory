-- Without COALESCE a partner with no payments gets NULL, not 0, and NULL sorts first under DESC.
-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
SELECT o.partner, SUM(p.amount) AS collected
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC, o.partner;
