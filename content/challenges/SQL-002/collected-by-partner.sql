-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
SELECT o.partner, SUM(o.total) AS collected
FROM orders o
JOIN payments p ON p.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC;
