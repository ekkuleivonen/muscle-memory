# Terms, privacy and what we record

The Terms (`/terms`) and Privacy Notice (`/privacy`) are drafts, written to be read, and versioned together as `LEGAL_VERSION` in `apps/web/lib/legal.ts`. Every app page requires accepting them first ("I'm 16 or older and accept…"), at `/consent`, or by starting from quick start (`/start`); nothing is recorded before. The account stores the version and time, the consent cookie (`mm_consent`) carries the legal version, and every recorded observation carries it as `termsVersion`. A new version therefore sends everyone back to sign again on their next visit.

The texts are not legal assurance. On 27 October 2026 the owner published them without the draft banner, from version 2026-10-27.1, before a legal review: the launch gates below that are still open stay open.

## Why no opt-in for recording

Under GDPR, consent bundled into sign-up is not valid consent, but consent is only one legal basis. What we record is covered without it:

| Purpose | Basis |
| --- | --- |
| Running the product: progress, stars, result cards, suggestions for what to do next | Contract, Art. 6(1)(b) |
| Making better challenges, including the operator's internal aggregate statistics ([admin statistics](admin-statistics.md)) | Legitimate interest, Art. 6(1)(f) |
| Publishing insights: statistics and findings across many people, never records or code | Legitimate interest, with an opt-out in Settings ("going stealth") |
| Security and abuse | Legitimate interest |

Selling personal data, publishing or sharing record-level data (even anonymised), or using it for unrelated purposes such as training models would need a new version at least, and opt-in consent for most of them; none is covered. Stealth governs publication and comparisons only: recording, uploads and internal statistics continue, and the notice says so.

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
| Processors | Cloudflare (Workers, R2, Pipelines, R2 Data Catalog, D1 for the catalog, Access for the owner preview and admin). The daily erasure runs on Cloudflare too, in a Container (ENG-372); GitHub Actions no longer touches player data. | `wrangler.jsonc`, `apps/erasure/wrangler.jsonc` |
| Deletion | `delete` in Settings writes a tombstone and removes the proof; uploads are refused at once; the erasure Worker (`apps/erasure`, a Cloudflare Container running `tools/erasure`) deletes rows daily; snapshot expiry removes old files about a week later. The tombstone and `erased/<id>/<time>.json` (a row count) stay. | [telemetry](telemetry.md#erasure) |
| Reset, export, import | Reset clears this browser only. Export downloads what this browser holds, secret included; import replaces it. There is no recovery or sync. | `apps/web/lib/backup.ts` |
| Access requests | `access` in Settings proves the ID with the device secret and returns a reference; the person emails it, and the operator answers with `tools/erasure/access.py` on their own machine. The request note (`access/<reference>.json`) stays. | `apps/ingest/src/index.ts`, `tools/erasure/access.py` |
| Storage location | Both R2 buckets report location APAC (checked with `wrangler r2 bucket info`, 27 October 2026); Workers run at Cloudflare's edge everywhere. | `wrangler r2 bucket info` |
| Publication, comparisons, model runs | No publication or released comparisons. Own private `/stats` derives evidence from retained local attempts ([developer profile](developer-profile.md)); historical summary retention is implemented but disabled pending approved storage disclosure, preserving the current latest-attempt-only promise. The notice promises insights only (no records, keystrokes or code about anyone), small groups suppressed, and a new version before any record-level release. Model runs never receive player data ([model runs](model-runs.md)). | none yet |
| Licences | Repository code is MIT (`LICENSE`). The Terms take a licence to submitted code and activity for running the product, research and publishing insights, ending at deletion except for insights already published. Challenge content is the operator's and is leaving the repository for R2 and D1 (owner, 27 October 2026); revisions already committed to the public repository were published under its MIT licence. | `LICENSE` |

Anything new to record goes into this table, [telemetry](telemetry.md) and the notice together, with a new version.

## Versions

- **2026-10-26**: starts, stars, copying from the challenge, the coarse environment, the optional profile answers (including an age band), the questions after completing; the browser keeps only what practice needs.
- **2026-10-26.1**: drops the random handle: an account is only a random ID.
- **2026-10-26.2**: the country uploads come from, worked out by Cloudflare; the IP address is never stored with records, and small countries are suppressed in anything published.
- **2026-10-27** (ENG-339): reconciled with shipped behaviour. The Privacy Notice adds referral codes, arrivals and shares, what a result link exposes, the browser storage and `mm_consent` cookie, the pre-acceptance arrival note, rate limiting by IP, Workers Logs at 7 days (was a `[30]` placeholder), Cloudflare and GitHub as providers, the operator's name and address, storage in Cloudflare's Asia-Pacific region, erasure within 30 days, what deletion leaves behind (no longer the proof), `export` and the new `access` request, that stealth does not stop recording and internal statistics include everyone, that stealth hides model comparisons too (following [model runs](model-runs.md); it used to say they kept working), that nothing is published yet, and transfers outside the EU/EEA as an open question. The Terms replace "we're working on" device moves with export and import, say the code is MIT while the challenges stay ours, describe sharing results, and say enforcement means refusing, excluding or deleting records (there are no notices without contact details). Publication is narrowed to insights (statistics and findings, never records or code) across the notice, the Terms, the consent points and settings, and the Terms' licence is no longer perpetual or irrevocable and drops open-licensed datasets. Settings' stealth confirmation says "published insights" instead of "our stats", since internal statistics include stealth accounts. The manifesto no longer says recording happens "with your consent": its basis is the contract and legitimate interest, not consent. The liability cap is ¥10,000 with an explicit carve-out for intent and gross negligence; the Privacy Notice adds what 16–17-year-olds can expect; the age band splits 16–17 from 18–24. The transfer safeguards replace their placeholder: Japan's adequacy, Cloudflare's DPA (SCCs, UK Addendum, DPF, Global CBPR) and GitHub's DPF certification.
- **2026-10-27.1** (ENG-372): erasure runs on Cloudflare, so GitHub is no longer a provider and leaves the providers and transfers. The pages drop the draft banner (owner's decision; not yet legally reviewed).

## Owner decisions and review status

| Item | Status |
| --- | --- |
| Operator | Owner, 27 October 2026: Ekku Leivonen, sole trader, running it as rowandreason.com; Estemcourt 1002, 4-1-20 Nionohama, Otsu, Shiga 520-0801, Japan; support@rowandreason.com. Update both pages (new version) if a company (R&R) is registered and takes over. |
| Storage location | Owner, 27 October 2026: data need not stay in Japan. Buckets are APAC. |
| Erasure within 30 days; tombstones and erasure counts kept indefinitely; proof removed on deletion | Proposed in ENG-339 and not objected to by the owner, 27 October 2026; confirm in review. |
| Access requests via Settings → access | Owner, 27 October 2026. |
| Publish insights only, not data | Owner, 27 October 2026: no plan to publish record-level data, only insights drawn from it. The Terms' licence narrowed to match: no longer perpetual and irrevocable, no open-licensed datasets. |
| Challenge content not open-licensed | Owner, 27 October 2026: the challenges are leaving the repository. |
| Erasure job on Cloudflare instead of GitHub Actions | Owner, 27 October 2026: do it ([ENG-372](https://linear.app/rowandreason/issue/ENG-372)), since GitHub has no processor contract with a free account. Done in version 2026-10-27.1: GitHub is no longer a provider. |
| Governing law and courts | Japan and Otsu, owner-supplied for the draft; not legally reviewed. |
| Minimum age 16, self-declared | Owner, 27 October 2026: keep 16, since high-school students are among the people it helps most. Not legally reviewed. The age band splits 16–17 from 18–24 so under-18s can be treated apart in anything published or compared. |
| Liability cap | ¥10,000 (was `[EUR 100]`), with an explicit carve-out for intent and gross negligence, which Japan's Consumer Contract Act requires since 2023 for a partial limit to hold. Chosen in ENG-339 at the owner's request ("whatever makes sense"); not legally reviewed. |
| Workers Logs retention | 7 days: Cloudflare's fixed retention on Workers Paid, not an owner choice. |
| Draft banner removed | Owner, 27 October 2026, before a legal review. |
| Everything else | Unreviewed: no lawyer has read either page. |

## Launch gates

Launch (ENG-337) waits until each of these is closed and recorded here. None are assumed settled.

1. **EU/UK representatives.** Whether a GDPR Art. 27 EU representative (and a UK one) is needed for a Japan-based sole trader monitoring the behaviour of people in the EU/UK; likely yes, since keystroke capture is neither occasional nor low-risk.
2. **Transfers.** Checked 27 October 2026, and stated in the notice:
   - EU/UK to us: Japan has EU and UK adequacy decisions.
   - Cloudflare: covered. Its Self-Serve Subscription Agreement (§6.1) incorporates the Cloudflare DPA, which uses the EU SCCs (Module 2, or 3 where we were a processor) with the UK Addendum, recognises the EU–US DPF (with the UK and Swiss extensions), and states Global CBPR and PRP certification.
   - GitHub: no longer a provider. Its Data Protection Agreement forms part of a written GitHub Customer Agreement, which a free personal account doesn't have, so the erasure job moved onto Cloudflare ([ENG-372](https://linear.app/rowandreason/issue/ENG-372)). CI still builds and tests the code, with synthetic data only.
   - Japan (APPI Art. 28) for Cloudflare as a foreign recipient: we rely on its Global CBPR certification and its DPA; a lawyer should confirm the Personal Information Protection Commission accepts Global CBPR as it does APEC CBPR. Art. 28 also obliges us to describe the recipient's measures on request, which the notice offers.
3. **Retention.** Review confirms 30 days for erasure (the job achieves about a week) and keeping tombstones, erasure counts and access-request notes indefinitely.
4. **Licence review.** Whether the narrowed licence to submitted code and activity is enough for research and publishing insights.
5. **Liability cap.** ¥10,000 and the carve-out, reviewed for Japanese and EU consumer law.
6. **Age.** Whether 16 and a self-declaration are adequate where the service is offered. 16–17-year-olds are children under the UK Age Appropriate Design Code (and under 18 in Japan, where minors can cancel contracts made without a parent's consent), so before launch: a written data protection impact assessment, which keystroke capture probably needs anyway; profile nudges (ENG-356 to ENG-367) that never pressure anyone to share more; and comparisons and insights that keep 16–17 apart or leave them out.
7. **Publication boundaries.** Before the first insight goes out: a minimum group size for every published figure (suggested 10 participants, and countries under 20 merged into "other"), including combinations of profile answers; stealth honoured in every publication and comparison, including for data collected before going stealth, and other people's stats hidden from stealth accounts. Stealth is reciprocal by design; have the lawyer confirm that trade-off, since it comes attached to an objection right. Record-level releases are out of scope; if they come back, they need their own review (raw typing rhythm is a fingerprint, and code is free text) and a new version first.
8. **Typing rhythm.** Whether keystroke timing is biometric or otherwise special-category data in any jurisdiction offered, given the commitment not to use it to identify anyone.
9. **Legal review** of both pages and the consent points. The pages no longer say they are drafts (owner, 27 October 2026), so any change a review brings is a new version, which asks everyone again.
