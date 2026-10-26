SELECT group_id, player_id, score
FROM (
  SELECT group_id, player_id, score,
         DENSE_RANK() OVER (PARTITION BY group_id ORDER BY score DESC) AS score_rank
  FROM scores
) ranked
WHERE score_rank <= 2
ORDER BY group_id ASC, player_id ASC;
