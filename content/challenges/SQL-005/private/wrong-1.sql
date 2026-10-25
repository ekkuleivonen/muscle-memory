-- Mistake: combines accounts.
SELECT account_id,id,SUM(amount) OVER (ORDER BY sequence,id ROWS UNBOUNDED PRECEDING) AS balance FROM transactions ORDER BY account_id,sequence,id;
