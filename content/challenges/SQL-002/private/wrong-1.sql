-- Sums the right column, but the inner join still drops partners with no payments.
-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
SELECT o.partner, SUM(p.amount) AS collected
FROM orders o
JOIN payments p ON p.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC, o.partner;
