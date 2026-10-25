SELECT group_id, player_id, score FROM (SELECT *, dense_rank() OVER (PARTITION BY group_id ORDER BY score DESC) AS place FROM scores) ranked WHERE place <= 2 ORDER BY group_id, player_id;
