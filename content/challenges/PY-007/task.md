Some subscribers got last week's newsletter three times. The sync sends one email per customer record, and the CRM export has several records for the same person:

```text
id  email
1   Ann@x.io
2    ann@x.io
3   bo@x.io
```

`dedupe(records)` runs before the newsletter sync. It gets a list of customer records, dicts with at least an `id` and an `email`, and returns the list without duplicates.

- Two records are duplicates when their emails match ignoring letter case (any letter, not only ASCII) and spaces around them. Only the email decides; ids and other fields don't.
- For example, `Σ@x.io` and `ς@x.io` match, as do `Straße@x.io` and `STRASSE@x.io`.
- Keep the first record for each email and drop the later ones. Records stay in their original order.
- A kept record is passed on unchanged, every field included: the sync and the CRM both need the email as it was written.
