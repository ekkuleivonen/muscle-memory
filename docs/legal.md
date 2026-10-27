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
| Deletion | `delete` in Settings writes a tombstone and removes the proof; uploads are refused at once; `tools/erasure` deletes rows daily; snapshot expiry removes old files about a week later. The tombstone and `erased/<id>/<time>.json` (a row count) stay. | [telemetry](telemetry.md#erasure) |
| Reset, export, import | Reset clears this browser only. Export downloads what this browser holds, secret included; import replaces it. There is no recovery or sync. | `apps/web/lib/backup.ts` |
| Access requests | `access` in Settings proves the ID with the device secret and returns a reference; the person emails it, and the operator answers with `tools/erasure/access.py` on their own machine. The request note (`access/<reference>.json`) stays. | `apps/ingest/src/index.ts`, `tools/erasure/access.py` |
| Storage location | Both R2 buckets report location APAC (checked with `wrangler r2 bucket info`, 27 October 2026); Workers run at Cloudflare's edge everywhere. | `wrangler r2 bucket info` |
| Publication, comparisons, model runs | None exist. The notice describes them as planned, with the rules the first release must meet. Model runs never receive player data ([model runs](model-runs.md)). | none yet |
| Licences | Repository code is MIT (`LICENSE`). The Terms take a broad licence to submitted code and activity. Challenge content is the operator's and is leaving the repository for R2 and D1 (owner, 27 October 2026); revisions already committed to the public repository were published under its MIT licence. | `LICENSE` |

Anything new to record goes into this table, [telemetry](telemetry.md) and the notice together, with a new version.

## Versions

- **2026-10-26**: starts, stars, copying from the challenge, the coarse environment, the optional profile answers (including an age band), the questions after completing; the browser keeps only what practice needs.
- **2026-10-26.1**: drops the random handle: an account is only a random ID.
- **2026-10-26.2**: the country uploads come from, worked out by Cloudflare; the IP address is never stored with records, and small countries are suppressed in anything published.
- **2026-10-27** (ENG-339): reconciled with shipped behaviour. The Privacy Notice adds referral codes, arrivals and shares, what a result link exposes, the browser storage and `mm_consent` cookie, the pre-acceptance arrival note, rate limiting by IP, Workers Logs at 7 days (was a `[30]` placeholder), Cloudflare and GitHub as providers, the operator's name and address, storage in Cloudflare's Asia-Pacific region, erasure within 30 days, what deletion leaves behind (no longer the proof), `export` and the new `access` request, that stealth does not stop recording and internal statistics include everyone, that stealth hides model comparisons too (following [model runs](model-runs.md); it used to say they kept working), that nothing is published yet, and transfers outside the EU/EEA as an open question. The Terms replace "we're working on" device moves with export and import, say the code is MIT while the challenges stay ours, describe sharing results, and say enforcement means refusing, excluding or deleting records (there are no notices without contact details). Settings' stealth confirmation says "published stats" instead of "our stats", since internal statistics include stealth accounts.

## Owner decisions and review status

| Item | Status |
| --- | --- |
| Operator | Owner, 27 October 2026: Ekku Leivonen, sole trader, running it as rowandreason.com; Estemcourt 1002, 4-1-20 Nionohama, Otsu, Shiga 520-0801, Japan; support@rowandreason.com. Update both pages (new version) if a company (R&R) is registered and takes over. |
| Storage location | Owner, 27 October 2026: data need not stay in Japan. Buckets are APAC. |
| Erasure within 30 days; tombstones and erasure counts kept indefinitely; proof removed on deletion | Proposed in ENG-339 and not objected to by the owner, 27 October 2026; confirm in review. |
| Access requests via Settings → access | Owner, 27 October 2026. |
| Challenge content not open-licensed | Owner, 27 October 2026: the challenges are leaving the repository. |
| Erasure job on Cloudflare instead of GitHub Actions | Owner wants it if easy, 27 October 2026; a follow-up, since it needs a Container, a cron Worker and secrets. GitHub stays listed until then. |
| Governing law and courts | Japan and Otsu, owner-supplied for the draft; not legally reviewed. |
| Minimum age 16, self-declared | Shipped; not legally reviewed. |
| Workers Logs retention | 7 days: Cloudflare's fixed retention on Workers Paid, not an owner choice. |
| Everything else | Unreviewed: no lawyer has read either page. |

## Launch gates

Launch (ENG-337) waits until each of these is closed and recorded here. None are assumed settled.

1. **EU/UK representatives.** Whether a GDPR Art. 27 EU representative (and a UK one) is needed for a Japan-based sole trader monitoring the behaviour of people in the EU/UK; likely yes, since keystroke capture is neither occasional nor low-risk.
2. **Transfers.** The safeguards for processing by Cloudflare (APAC storage, edge everywhere) and GitHub outside the EU/EEA, and Japan's APPI rules on providing data to third parties abroad. Fills the bracketed transfer line in the notice.
3. **Retention.** Review confirms 30 days for erasure (the job achieves about a week) and keeping tombstones, erasure counts and access-request notes indefinitely.
4. **Licences.** Whether the Terms' perpetual, irrevocable licence to submitted code and activity is the right scope (proposed: until deletion for anything unpublished, perpetual only for what was published), and the licence published datasets will carry.
5. **Liability cap.** `[EUR 100]` and the consumer-law carve-out, reviewed for Japanese and EU consumer law.
6. **Age.** Whether 16 and a self-declaration are adequate where the service is offered.
7. **Publication boundaries.** Before the first release: new random IDs per dataset, coarsened times, no free text, small groups suppressed (countries included), stealth honoured in every export pipeline and comparison, including for data collected before going stealth, and other people's stats hidden from stealth accounts. Stealth is reciprocal by design; have the lawyer confirm that trade-off, since it comes attached to an objection right. Raw key timings and edit streams can't honestly be called anonymous (typing rhythm is a fingerprint), so they go out only as pseudonymised data under a data use agreement, never in an open release; code is free text too (comments and names), so it is left out of open releases or reviewed first.
8. **Typing rhythm.** Whether keystroke timing is biometric or otherwise special-category data in any jurisdiction offered, given the commitment not to use it to identify anyone.
9. **Legal review** of both pages and the consent points, then `LEGAL_DRAFT` set to false in the same change as a new version.
