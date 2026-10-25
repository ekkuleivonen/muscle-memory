-- Mistake: row_number drops ties.
SELECT group_id,player_id,score FROM (SELECT *,row_number() OVER (PARTITION BY group_id ORDER BY score DESC,player_id) AS place FROM scores) r WHERE place<=2 ORDER BY group_id,player_id;
