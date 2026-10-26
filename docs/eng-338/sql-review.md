# SQL contract and fixture review

All five schemas were compared to the visible statements and independently reviewed. Normal UI execution uses PGlite/PostgreSQL; no host SQL substitute was used. All authored case fixtures loaded and the blind first candidates passed every case.

| Challenge | UI cases | Public edge probes | Schema/fixture/result checks |
| --- | --- | --- | --- |
| SQL-001 | 15/15 | 3 passed | orders(id,customer,total); integer totals, bigint sums, exact names; revenue descending/customer ascending ties; negative adjustments/empty input. |
| SQL-002 | 16/16 | 3 passed | orders/payments numeric(12,2); foreign-key order linkage; every payment counted including duplicates; unpaid partners zero; amount descending/partner tie order. No date column/filter is promised. |
| SQL-003 | 15/15 | 3 passed | orders/payments, no payment-row identity requirement; absence rather than zero sum defines unpaid; ascending order ID; any payment amount counts. |
| SQL-004 | 5/5 | 3 passed | scores primary player IDs; group-local distinct rank, all ties; result group/player/score order and group/player sorting. |
| SQL-005 | 5/5 | 2 passed | transactions primary IDs; account-local ordered prefix by sequence then ID; negative/zero amounts and tied sequences; output account/ID/balance. |

Every wrong candidate failed normal UI checks; public-edge probes also distinguished each SQL wrong candidate. These receipts establish the tested fixtures and behaviors, not exhaustive enumeration of all possible queries or a human study.
