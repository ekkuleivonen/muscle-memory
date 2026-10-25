Return each transaction with its account balance immediately after that transaction.

Table: `transactions(id integer PRIMARY KEY, account_id integer NOT NULL, sequence integer NOT NULL, amount integer NOT NULL)`. Start every account at zero. Within an account, process by sequence ascending, breaking ties by id ascending; input row order is irrelevant. Negative amounts subtract, and zero amounts still produce a row. Output columns: account_id, id, balance, sorted by account_id, sequence, id (all ascending). Empty input returns no rows. At most 100 rows; amounts are in -10000..10000. Write one PostgreSQL query; the harness creates and populates the table for every case.

## Examples

Input: `{"transactions": [[1, 1, 1, 10], [2, 1, 2, -3], [3, 2, 1, 5]]}` → output: `[[1, 1, 10], [1, 2, 7], [2, 3, 5]]`.
Input: `{"transactions": []}` → output: `[]`.
