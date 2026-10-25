Return every player with one of the two highest distinct scores in their group.

Table: `scores(player_id integer PRIMARY KEY, group_id integer NOT NULL, score integer NOT NULL)`. Each player has one row; groups may have one player, fewer than two distinct scores, or ties. Output columns are group_id, player_id, score, in that order, sorted by group_id ascending then player_id ascending. Include all ties at both score levels. Empty input returns no rows. Scores are integers in -1000..1000; at most 100 rows. Write one PostgreSQL query; the harness creates and populates the table for each case.

## Examples

Input: `{"scores": [[1, 1, 50], [2, 1, 40], [3, 1, 40], [4, 1, 30]]}` → output: `[[1, 1, 50], [1, 2, 40], [1, 3, 40]]`.
Input: `{"scores": [[7, 2, -5]]}` → output: `[[2, 7, -5]]`.
