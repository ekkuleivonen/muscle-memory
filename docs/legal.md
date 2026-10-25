# Terms, privacy and what we record

The Terms (`/terms`) and Privacy Notice (`/privacy`) are drafts, written to be read, and versioned together as `LEGAL_VERSION` in `apps/web/lib/legal.ts`. Every app page requires accepting them first ("I'm 16 or older and accept…"), at `/consent`, or by starting from quick start (`/start`); nothing is recorded before. The account stores the version and time, the consent cookie (`mm_consent`) carries the legal version, and every recorded observation carries it as `termsVersion`. A new version therefore sends everyone back to sign again on their next visit.

## Why no opt-in for recording

Under GDPR, consent bundled into sign-up is not valid consent, but consent is only one legal basis. What we record is covered without it:

| Purpose | Basis |
| --- | --- |
| Running the product: progress, stars, result cards, suggestions for what to do next | Contract, Art. 6(1)(b) |
| Making better challenges | Legitimate interest, Art. 6(1)(f) |
| Publishing anonymised stats and record-level datasets | Legitimate interest, with an opt-out in Settings ("going stealth") |
| Security and abuse | Legitimate interest |

Selling personal data, sharing it beyond published anonymised datasets, or using it for unrelated purposes such as training models would need opt-in consent and is not covered.

Records are uploaded to our servers as people practise; deleting an account erases them there too, with the device secret as proof. What is recorded ([telemetry](telemetry.md)) is listed in the Privacy Notice in plain words, keystroke timing and physical keys included, with a line on typing rhythm being able to tell people apart and our commitment not to use it for that. Version 2026-10-26 added the starts, stars, copying from the challenge, the coarse environment, the new optional profile answers (including an age band) and the questions after completing, and says the browser keeps only what practice needs; everyone is asked again. Version 2026-10-26.1 drops the random handle: an account is only a random ID. Version 2026-10-26.2 adds the country uploads come from, worked out by Cloudflare from the connection; the IP address is never stored with records, and small countries are suppressed in anything published.

The Terms also grant a licence to submitted code (needed to publish solutions), set a minimum age of 16, and forbid AI assistance in human runs and re-identifying people in published datasets.

## Before launch

- Lawyer review of both pages; fill in the [bracketed] placeholders (full legal operator identity/address, retention periods, processors, hosting region, liability cap and jurisdiction review); set `LEGAL_DRAFT` to false.
- Anonymisation review before the first record-level release: new random IDs per dataset, coarsened times, no free text, small groups suppressed.
- Honour `stealth` in every export pipeline and in comparisons, including for data collected before going stealth, and hide other people's stats from stealth accounts. Stealth is reciprocal by design; have the lawyer confirm that trade-off, since it comes attached to an objection right.
- Access and portability requests, by email at first (deletion is `delete` in Settings, erased on the server by `tools/erasure`).

Operator-supplied draft details (25 October 2026): rowandreason.com, support@rowandreason.com, Otsu, Shiga, Japan 520-0801; Japan/Otsu used for the draft governing-law locality. This is an operator label and locality, not a verified registered company name or complete street address. Hosting region is not yet supplied. Keep `LEGAL_DRAFT` true pending the remaining details and legal review.
