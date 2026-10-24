# Terms, privacy and what we record

The Terms (`/terms`) and Privacy Notice (`/privacy`) are drafts, written to be read, and versioned together as `LEGAL_VERSION` in `apps/web/lib/legal.ts`. Onboarding starts with accepting them ("I'm 16 or older and accept…"); there is no way in without it. The account stores the version and time, the session cookie carries `<setup>.<legal version>`, and recorded observations carry `terms-<version>` as their `consentVersion`. A new version therefore sends everyone back to sign again on their next visit.

## Why no opt-in for recording

Under GDPR, consent bundled into sign-up is not valid consent, but consent is only one legal basis. What we record is covered without it:

| Purpose | Basis |
| --- | --- |
| Running the product: board, progress, issue suggestions, comparisons with people (aggregates only) and LLMs | Contract, Art. 6(1)(b) |
| Making better issues | Legitimate interest, Art. 6(1)(f) |
| Publishing anonymised stats and record-level datasets | Legitimate interest, with an opt-out in Settings ("Exclude my data from published datasets") |
| Security and abuse | Legitimate interest |

Selling personal data, sharing it beyond published anonymised datasets, or using it for unrelated purposes such as training models would need opt-in consent and is not covered.

The Terms also grant a licence to submitted code (needed to publish solutions), set a minimum age of 16, and forbid AI assistance in human runs and re-identifying people in published datasets.

## Before launch

- Lawyer review of both pages; fill in the [bracketed] placeholders (company, contact, retention periods, processors, region, governing law); set `LEGAL_DRAFT` to false.
- Anonymisation review before the first record-level release: new random IDs per dataset, coarsened times, no free text, small groups suppressed.
- Honour `excludeFromPublishedData` in every export pipeline, including for data collected before opting out.
- Once data syncs to servers: access, portability and deletion requests (by email at first), and server-side deletion on **Delete account**.
