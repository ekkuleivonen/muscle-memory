Rui, first thing Monday:

> Monday's active-customers report says **18,406**. Last Monday it was **18,618**, and nobody closed 212 accounts over the weekend. I spot-checked three of the missing ones and they're all phone orders from the Leeds store:

```text
id       name               email   phone
C-20931  Hollis Bakery              0113 496 0021
C-20977  Marsh & Daughters          0113 496 0088
C-21012  T. Okafor                  0113 496 0140
```

The dedupe step was sped up on Tuesday: it used to compare every pair of records, which took 40 minutes on Northwind's 180k-row file, and now it makes one pass with a dict. This is the first Monday report since.

`dedupe_customers(rows)` takes the night's customer records (a list of dicts, each with fields such as `id`, `name`, `email` and `phone`; a field's value may be `None`) and returns one record per customer, in the order customers were first seen.

- Records whose emails match once normalised are the same customer. `normalize_email(email)`, further down the file, does the normalising: it returns the email trimmed of surrounding whitespace and lowercased, or `None` when there is no usable email (`None`, empty, or only whitespace). Phone and in-store customers often have none.
- For each customer, the first record is kept. A later duplicate only fills in fields the kept record left blank (`None` or `""`, or missing): each such field takes the duplicate's value, so the earliest later duplicate with a value wins. Nothing else changes; in particular the kept record's email stays as written.
- A record without a usable email can't be matched to anything, so it is always kept, as it is, in its place.
- The input rows (and their dicts) must not be changed. No rows gives `[]`.

The starter's `_fill_blanks(customer, duplicate)` already fills a kept record's blank fields from a duplicate, in place.

Requirement: keep it to one pass with a lookup by email. Don't compare each record against the customers kept so far: the nightly window is two hours.
