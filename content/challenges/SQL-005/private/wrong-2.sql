-- Mistake: RANGE peers combine transactions with equal sequence.
SELECT account_id,id,SUM(amount) OVER (PARTITION BY account_id ORDER BY sequence) AS balance FROM transactions ORDER BY account_id,sequence,id;
