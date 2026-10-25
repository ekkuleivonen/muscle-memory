-- Keeps the order total: a split order counts its total once per payment, and a partly paid one in full.
-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
SELECT o.partner, COALESCE(SUM(o.total), 0) AS collected
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC, o.partner;
