SELECT s.group_id,s.player_id,s.score FROM scores s WHERE (SELECT count(DISTINCT t.score) FROM scores t WHERE t.group_id=s.group_id AND t.score>s.score)<2 ORDER BY s.group_id,s.player_id;
