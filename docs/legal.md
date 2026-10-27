# Terms, privacy and what we record

The Terms (`/terms`) and Privacy Notice (`/privacy`) are drafts, written to be read, and versioned together as `LEGAL_VERSION` in `apps/web/lib/legal.ts`. Every app page requires accepting them first ("I'm 16 or older and accept…"), at `/consent`, or by starting from quick start (`/start`); nothing is recorded before. The account stores the version and time, the consent cookie (`mm_consent`) carries the legal version, and every recorded observation carries it as `termsVersion`. A new version therefore sends everyone back to sign again on their next visit.

The texts are not legal assurance. `LEGAL_DRAFT` stays true, with its banner on both pages, until every launch gate below is closed.

## Why no opt-in for recording

Under GDPR, consent bundled into sign-up is not valid consent, but consent is only one legal basis. What we record is covered without it:

| Purpose | Basis |
| --- | --- |
| Running the product: progress, stars, result cards, suggestions for what to do next | Contract, Art. 6(1)(b) |
| Making better challenges, including the operator's internal aggregate statistics ([admin statistics](admin-statistics.md)) | Legitimate interest, Art. 6(1)(f) |
| Publishing anonymised stats and record-level datasets | Legitimate interest, with an opt-out in Settings ("going stealth") |
| Security and abuse | Legitimate interest |

Selling personal data, sharing it beyond published anonymised datasets, or using it for unrelated purposes such as training models would need opt-in consent and is not covered. Stealth governs publication and comparisons only: recording, uploads and internal statistics continue, and the notice says so.

## What the pages rest on

Checked against the code on 27 October 2026 (ENG-339). Each line is what the notice says and where it is true.

| Area | Shipped behaviour | Source |
| --- | --- | --- |
| Identity | A random participant ID and device secret per browser; the server keeps the secret's SHA-256 as proof. A separate random referral code for share links. No name, email or password. | `packages/browser/practice-store.ts`, `apps/ingest/src/index.ts` |
| Before acceptance | Nothing recorded or uploaded. Only `muscle-memory.arrival` (landing page, time, referral code) is kept in localStorage, sent as `site.arrived` after acceptance. | `apps/web/lib/site-log.ts` |
| Cookie | `mm_consent`, the accepted version only, one year, `SameSite=Lax`. | `apps/web/lib/account.ts` |
| Practice and site streams | Everything in [telemetry](telemetry.md): keys with timing and physical key, edits, pastes, selection, scroll, focus, copies (position only; challenge text copied up to 4 KiB), editor help shown, runs and outputs, submissions, completions, answers after completing, pages and their queries, visibility, starts, stars, shares, coarse environment. | `packages/domain/practice.ts`, `site.ts` |
| Optional profile | Twelve category questions including an age band, never free text, with where each was given; stealth. | [profile](profile.md) |
| Server-derived | `received_at` and `country` (`request.cf.country`). No IP, city or region in rows. | `apps/ingest` |
| IP use | Per-address rate limit on `cf-connecting-ip`, in memory, not stored by us. Workers Logs (`observability.enabled` on the ingest Worker) keep request logs for 7 days on Workers Paid and may include the address. | `apps/ingest/wrangler.jsonc` |
| On the device | IndexedDB records and outbox, compacted to each challenge's latest attempt after upload; progress, stars and profile in localStorage. | `packages/browser/compaction.ts` |
| Result links | Allowlisted outcome fields and referral code; code only when ticked, in the URL fragment, never sent to the server. | `apps/web/lib/outcome.ts`, `share.ts` |
| Third parties | No analytics, trackers or ads; X and LinkedIn are plain links opened on click. | `apps/web/app/_components/share.tsx` |
| Processors | Cloudflare (Workers, R2, Pipelines, R2 Data Catalog, D1 for the catalog, Access for the owner preview and admin). GitHub Actions runs the daily erasure, which reads the events table to rewrite it. | `wrangler.jsonc`, `.github/workflows/erasure.yml` |
| Deletion | `delete` in Settings writes a tombstone; uploads are refused at once; `tools/erasure` deletes rows daily; snapshot expiry removes old files about a week later. The tombstone, the proof and `erased/<id>/<time>.json` (a row count) stay. | [telemetry](telemetry.md#erasure) |
| Reset, export, import | Reset clears this browser only. Export downloads what this browser holds, secret included; import replaces it. There is no server-side export, recovery or sync. | `apps/web/lib/backup.ts` |
| Access requests | By email only. The operator can find records by participant ID; how a requester proves the ID is theirs is not decided (see gates). | none yet |
| Publication, comparisons, model runs | None exist. The notice describes them as planned, with the rules the first release must meet. Model runs never receive player data ([model runs](model-runs.md)). | none yet |
| Licences | Repository code is MIT (`LICENSE`). The Terms take a broad licence to submitted code and activity. Challenge content has no stated licence. | `LICENSE` |

Anything new to record goes into this table, [telemetry](telemetry.md) and the notice together, with a new version.

## Versions

- **2026-10-26**: starts, stars, copying from the challenge, the coarse environment, the optional profile answers (including an age band), the questions after completing; the browser keeps only what practice needs.
- **2026-10-26.1**: drops the random handle: an account is only a random ID.
- **2026-10-26.2**: the country uploads come from, worked out by Cloudflare; the IP address is never stored with records, and small countries are suppressed in anything published.
- **2026-10-27** (ENG-339): reconciled with shipped behaviour. The Privacy Notice adds referral codes, arrivals and shares, what a result link exposes, the browser storage and `mm_consent` cookie, the pre-acceptance arrival note, rate limiting by IP, Workers Logs at 7 days (was a `[30]` placeholder), Cloudflare and GitHub as providers, what deletion leaves behind, `export` and how access requests are matched, that stealth does not stop recording and internal statistics include everyone, that stealth hides model comparisons too (following [model runs](model-runs.md); it used to say they kept working), that nothing is published yet, and transfers outside the EU/EEA as an open question. The Terms replace "we're working on" device moves with export and import, replace the "our stuff" clause that contradicted the MIT licence with a placeholder for the content licence, describe sharing results, and say enforcement means refusing, excluding or deleting records (there are no notices without contact details). Settings' stealth confirmation says "published stats" instead of "our stats", since internal statistics include stealth accounts.

## Owner decisions and review status

| Item | Status |
| --- | --- |
| Operator label, contact and locality | Supplied by the owner on 25 October 2026: rowandreason.com, support@rowandreason.com, Otsu, Shiga, Japan 520-0801. Not a verified legal entity name or full address. |
| Governing law and courts | Japan and Otsu, owner-supplied for the draft; not legally reviewed. |
| Minimum age 16, self-declared | Shipped; not legally reviewed. |
| Workers Logs retention | 7 days: Cloudflare's fixed retention on Workers Paid, not an owner choice. |
| Everything else | Unreviewed: no lawyer has read either page. |

## Launch gates

Launch (ENG-337) waits until each of these is closed and recorded here. None are assumed settled.

1. **Controller identity.** The full legal name and registered address of the operator, replacing the domain label. Whether a GDPR Art. 27 EU representative (and a UK one) is needed for a Japan-based controller offering this to people in the EU/UK.
2. **Hosting region and transfers.** The R2 buckets' location, and the safeguards for processing by Cloudflare and GitHub outside the EU/EEA (and Japan's APPI rules on providing data to third parties abroad). Fills both bracketed transfer lines in the notice.
3. **Retention.** The owner confirms 30 days for erasure (`[30]`; the job achieves about a week), and how long tombstones, proofs and erasure counts are kept (indefinitely today).
4. **Access and portability.** How someone proves a participant ID is theirs without sending the device secret by email, and what a server-side export contains. Until decided, the notice promises only that we need the ID and to check it.
5. **Licences.** Whether the Terms' perpetual, irrevocable licence to submitted code and activity is the right scope; the licence for challenge content; the licence published datasets will carry.
6. **Liability cap.** `[EUR 100]` and the consumer-law carve-out, reviewed for Japanese and EU consumer law.
7. **Age.** Whether 16 and a self-declaration are adequate where the service is offered.
8. **Publication boundaries.** Before the first release: new random IDs per dataset, coarsened times, no free text, small groups suppressed (countries included), stealth honoured in every export pipeline and comparison, including for data collected before going stealth, and other people's stats hidden from stealth accounts. Stealth is reciprocal by design; have the lawyer confirm that trade-off, since it comes attached to an objection right.
9. **Typing rhythm.** Whether keystroke timing is biometric or otherwise special-category data in any jurisdiction offered, given the commitment not to use it to identify anyone.
10. **Legal review** of both pages and the consent points, then `LEGAL_DRAFT` set to false in the same change as a new version.
