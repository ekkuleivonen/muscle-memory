# Terms, privacy and what we record

The Terms (`/terms`) and Privacy Notice (`/privacy`) are drafts, written to be read, and versioned together as `LEGAL_VERSION` in `apps/web/lib/legal.ts`. Every app page requires accepting them first ("I'm 16 or older and accept…"), at `/consent`, on `/play`, or at the start of onboarding; nothing is recorded before. The account stores the version and time, the session cookie carries `<setup>.<legal version>`, and recorded observations carry `terms-<version>` as their `consentVersion`. A new version therefore sends everyone back to sign again on their next visit.

## Why no opt-in for recording

Under GDPR, consent bundled into sign-up is not valid consent, but consent is only one legal basis. What we record is covered without it:

| Purpose | Basis |
| --- | --- |
| Running the product: board, progress, issue suggestions, comparisons with people (aggregates only) and LLMs | Contract, Art. 6(1)(b) |
| Making better issues | Legitimate interest, Art. 6(1)(f) |
| Publishing anonymised stats and record-level datasets | Legitimate interest, with an opt-out in Settings ("going stealth") |
| Security and abuse | Legitimate interest |

Selling personal data, sharing it beyond published anonymised datasets, or using it for unrelated purposes such as training models would need opt-in consent and is not covered.

Records are uploaded to our servers as people play ([telemetry](telemetry.md)); deleting an account erases them there too, with the device secret as proof. What is recorded is listed in the Privacy Notice in plain words, keystroke timing included, with a line on typing rhythm being able to tell people apart and our commitment not to use it for that. The version moved to 2026-10-25 when keystrokes, page views and visibility were added, so everyone is asked again.

The Terms also grant a licence to submitted code (needed to publish solutions), set a minimum age of 16, and forbid AI assistance in human runs and re-identifying people in published datasets.

## Before launch

- Lawyer review of both pages; fill in the [bracketed] placeholders (company, contact, retention periods, processors, region, governing law); set `LEGAL_DRAFT` to false.
- Anonymisation review before the first record-level release: new random IDs per dataset, coarsened times, no free text, small groups suppressed.
- Honour `stealth` in every export pipeline and in comparisons, including for data collected before going stealth, and hide other people's stats from stealth accounts. Stealth is reciprocal by design; have the lawyer confirm that trade-off, since it comes attached to an objection right.
- Once data syncs to servers: access, portability and deletion requests (by email at first), and server-side deletion on `delete` in Settings.
