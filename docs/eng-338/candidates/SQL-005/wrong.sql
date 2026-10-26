SELECT account_id, id,
       SUM(amount) OVER (
         PARTITION BY account_id
         ORDER BY sequence ASC, id DESC
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS balance
FROM transactions
ORDER BY account_id ASC, sequence ASC, id ASC;
