-- Mistake: rank skips the second distinct score after a first-place tie.
SELECT group_id,player_id,score FROM (SELECT *,rank() OVER (PARTITION BY group_id ORDER BY score DESC) AS place FROM scores) r WHERE place<=2 ORDER BY group_id,player_id;
