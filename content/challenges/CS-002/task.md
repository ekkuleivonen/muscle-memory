Customers keep emailing about a one-cent difference between the invoice and the reminder: the late fee doesn't round the way finance's spreadsheet does.

`LateFee(balance, daysLate)` returns the late fee on an overdue invoice. `balance` is the amount owed in dollars (0 or more, to the cent), and the fee is in dollars too.

- The fee is 0.5% of the balance for each day late, at most 10% of the balance.
- That fee is rounded to cents with halves rounded away from zero, as the spreadsheet does: a fee of 0.505 is 0.51.
- Nothing is charged when `daysLate` is 0 or negative.
