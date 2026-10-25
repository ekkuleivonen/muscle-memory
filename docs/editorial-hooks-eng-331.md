# Editorial hook inventory · ENG-331

## Dot’s selection and normalized-source recheck · 25 October 2026

**Selected:** B / SHOP-5, C / DATA-6 and D / API-8 are primaries. A / QUICK-2 is the low-friction starter, not the flagship viral hook. E / FN-5 is a reserve. Final campaign/debate selection: I is retained as an identity campaign draft; K is retained as an opinion/tradeoff draft. J and M are secondary reserves. L is held: its publication constraint is met, but meaningful verification of cache reuse is not established. No further variants are needed. These draft selections do not replace or block the artifact hooks. No public post or automatic production-copy change is authorized.

This section supersedes the original baseline inventory for new artifact mapping. Source inspected: ENG-329 draft PR #38 at exact pushed head `3719e600d2419617d71a018deae7fa389282fc27`, confirmed as the latest remote head at this final recheck. Compared with the previous recheck at `7c09d35f05291aeac6b4d4a4d1f7393f872cd874`, all seven mapped revision hashes and their complete revision objects are unchanged: A/B/C/D artifact mappings, E reserve, F/L cache source and G/M token source. No selected payoff changed. These are proposed current revisions on that branch, not a claim that they are live in production. The editorial branch still starts from the required live baseline; no ENG-329 production/content commits are imported.

For A/B/C/D, compared each normalized body, entry, cases and required rules with the original baseline: the full case objects (IDs, inputs, expected values and visibility) are byte-for-byte equal after JSON serialization. Each has exactly one editable entry. Reviewed E/F/G as well to ground the reserve and new alternatives. Hash changes reflect normalized descriptions/feedback content; unchanged case outcomes do not mean all requirements are independently behavior-tested. Source inspection is not a rerun of the browser publish suite.

This recheck covers the selected sources only, not closure of unrelated catalog review findings or blanket catalog acceptance. Recheck the destination revision at integration: if it differs from the hash below, compare its body/cases/rules before carrying this copy forward. Old baseline hashes below are historical only and must not enter new artifacts.

### Handoff to ENG-332

Proceed with selected B/C/D and starter A using truthful fallback. These hooks describe the challenge, not an individual result. Use the destination catalog’s actual revision and existing honest outcome projection; when completion or outcome evidence is absent, say so. B/C/D stay plain, short challenge prompts; A stays the starter. Do not put long I/K campaign copy into every share card. Use the exact final revision hashes in the current register below; campaign drafts are separate editorial options, not a dependency for sharing mechanics. No solution, implementation hint or unverified completion claim belongs in preview copy. D uses a stated provider-policy distinction, not manufactured uncertainty about identity.

### A / QUICK-2 · Starter, not flagship

**Current source:** `word-count-javascript`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/seed.ts#L579); revision `sha256:55f86f1b8bf7069f92738a17e5839b45269fd3214ac6f47cac5458ec49f7f394`; sole editable entry `src/count-words.js`.

**Hook:** “An empty post says “1 word.” Can you make the count match the text?”

**Recheck / changed payoff:** No changed payoff. The description now explicitly defines whitespace, carriage returns, punctuation, symbols and non-English characters. The 19 case objects are unchanged. QUICK remains unlisted; do not claim catalog placement or a measured five-minute solve.

### B / SHOP-5 · Primary

**Current source:** `refund-totals`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/seed.ts#L1358); revision `sha256:68ed6a0dcc9d8270bef73e4ac44602d6e2e5d35d4d634bb08402aa437b672254`; sole editable entry `src/cart/totals.js`.

**Hook:** “They paid $45 for the jacket. The refund is $40.50. Make the refund match the receipt.”

**Recheck / changed payoff:** No changed payoff: return exactly the amount paid for returned lines, as negative cents (or zero). The 17 case objects are unchanged. The description now states the allocated-discount input and imported helper contracts, and explicitly says to leave orderTotal unchanged. That scope constraint still uses a text-pattern blocker, not an independent checkout behavior test. Do not claim checkout was exhaustively verified.

### C / DATA-6 · Primary

**Current source:** `collected-by-partner`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/more/data-platform.ts#L207); revision `sha256:de8621e616e78cb42b58d2d189a0b9738171c3345ef3193d1af425130e4ba130`; sole editable entry `queries/collected-by-partner.sql`.

**Hook:** “The payment report overcounts one partner—and leaves out the one who paid nothing. Fix the SQL.”

**Recheck / changed payoff:** No changed payoff: count every received payment, including equal-valued payments, retain partners with orders but no payments at zero, and order the rows as specified. The 15 case objects are unchanged. The description now includes every schema column, output columns, partial-payment behavior and the equal-payment requirement. Do not tease DISTINCT or the join type; clarity about duplicate amounts is a requirement, not an implementation hint.

### D / API-8 · Primary

**Current source:** `canonical-signup-email`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/more/accounts-api.ts#L169); revision `sha256:a7d434b1858edc7bc26cd2fbf95f53959221cd9cf5e7ea33afff7cdecd0a2c59`; sole editable entry `canonical_email.go`.

**Hook:** “Fix duplicate sign-ups without treating every email provider like Gmail.”

**Recheck / changed payoff:** No changed payoff: implement the specified lookup-key policy, not identity inference. The 19 case objects are unchanged. The description now makes Unicode whitespace, exact Gmail domains and the unchanged stored address explicit. This hook replaces the earlier “two different people?” wording: the task does not ask the player to determine who owns an address. Whole-address lowercasing is the scenario’s stated assumption, not a universal email rule.

### E / FN-5 · Reserve

**Current source:** `notebook-ditto-marks`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/more/field-notes.ts#L849); revision `sha256:30bf6730b7b3943290630f07b8f32679f3db45d88c9ae6a06e82c0cfb7a46c90`; sole editable entry `notebook/transcribe.py`.

**Hook:** “A notebook says “same as above.” Read the marks without inventing missing data.”

**Recheck / changed payoff:** No changed payoff. All 17 case objects are unchanged. The description now gives helper contracts, precise partially unresolved-row propagation, line numbering and the no-print requirement. Page boundaries remain explicit requirements. No measured volunteer outcome is supported.

### F / SHOP-7 · Unselected source for alternative L

**Current source:** `stale-cart-summary`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/more/storefront.ts#L571); revision `sha256:b6c151c3f9ec3fe33713a0be00af54b0a1a03e741d1eaf96a325d4f36ede1d6a`; sole editable entry `src/cart/cart.js`.

**Hook:** “The cart is faster. Change the quantity and the total stays the same. Fix the total while keeping the cache.”

**Recheck / changed payoff:** No changed payoff; all 16 case objects are unchanged. The description now includes mutation/helper contracts and explicitly requires cached results when nothing changes. A text-pattern blocker checks for a memo field; this is not a performance measurement or proof of optimal caching.

### G / API-9 · Unselected source for alternative M

**Current source:** `refresh-token-reuse`, [normalized seed](https://github.com/ekkuleivonen/muscle-memory/blob/3719e600d2419617d71a018deae7fa389282fc27/content/more/accounts-api.ts#L397); revision `sha256:6045d32f4490600279eed6a41ade3c3d41a610b4c452b59ab6f8fe61f1326ebd`; sole editable entry `src/gateway/refresh.ts`.

**Hook:** “The login fix stopped the logouts. It also lets an old token work again. Keep the grace window and reject the replay.”

**Recheck / changed payoff:** No changed payoff; all 17 case objects are unchanged. The full ordered policy, inclusive 10-second grace, imported API and no-console requirement are now in the description. It no longer requires browsing policy.ts. This is a fixed-policy exercise, not authorization to choose a different security policy or a verified production security outcome.

## Final campaign/debate drafts and reserves · parent review only

I and K are retained drafts; J and M are secondary reserves. L is held under the verification condition below. First-person wording is optional copy only for an actual person who chooses to say it. Never generate it as a claim about a player’s feelings or AI use, infer that sentiment from a result, or present it as a testimonial. These are editorial positions/questions, not fabricated participant quotations. Disagreement concerns the broader craft choice; every challenge still has clear mandatory rules and a deterministic answer. Existing selected hooks remain available unchanged except D’s clarity correction.

### I · Identity campaign draft · retained — B / SHOP-5

**Opening:** “I use AI at work. I still want to be able to fix this myself. Paid $45. Refunded $40.50.”

**Edge / opinion split:** Is keeping an independent coding practice valuable when assistance is available? This voices a preference without claiming everyone should share it. **Actual anchor / payoff:** B’s normalized source above, especially case-2 (−4500 cents) and case-8 (partial return). The challenge supplies the concrete thing to try; no claim that solving it measures independence.

**Spoiler risk:** Low; no cause or method given. **Limits:** An actual speaker must choose this first-person voice for themselves; dot’s editorial selection does not make it true of any player. No claim AI caused decline, no requirement to abandon workplace tools, no “real developer” threshold or model comparison.

### J · Zero belongs in the report · secondary reserve — C / DATA-6

**Opening:** “A tidy payment report can still tell the wrong story. I want the partner who paid nothing to stay in it.”

**Edge / opinion split:** Favor an accountable report over a shorter paid-only view. A paid-only report can be useful elsewhere; this challenge explicitly asks for all partners with orders. **Actual anchor / payoff:** C’s normalized source above, case-3 (Corvid remains at 0) and case-6 (two equal payments both count). The position is about what a useful report shows, not permission to reinterpret this query’s requirements.

**Spoiler risk:** Low to medium; reveals a stated inclusion requirement, not the join/aggregation fix. **Limits:** Do not turn it into a claim that every report must include zeros or that someone actually made a finance decision from this exercise.

### K · Opinion/tradeoff draft · retained — D / API-8

**Opening:** “I don’t want ‘cleaner’ data if it changes who an address belongs to. Gmail’s rules aren’t every provider’s rules.”

**Edge / opinion split:** Push back on a universal clean-up rule in favor of bounded normalization. **Actual anchor / payoff:** D’s normalized source above; case-3 applies Gmail’s policy, case-4 preserves a non-Gmail tag, cases-15/16 reject lookalike domains as Gmail. The task already specifies all these decisions; the player is implementing them, not researching ownership.

**Spoiler risk:** Medium; the domain boundary is required context, not a secret. No sequence of normalization steps is given. **Limits:** The first sentence expresses the reason to avoid collapsing distinct keys, not evidence of an account takeover or proof that email keys establish a person’s identity. Do not broaden the exercise into production email advice.

### L · Technical-debate draft · held, condition not established — F / SHOP-7

**Eligibility:** Not retained for artifact/campaign use in this batch. The current normalized description explicitly publishes “summary() must not reprice the cart when nothing changed since the last call.” However, `ada-keep-memo` only looks for a field name resembling cache/memo/version/etc.; the 16 output cases do not observe whether unchanged calls reprice. An otherwise uncached implementation can retain a matching unused field, so field presence is not a meaningful check of reuse. No cache instrumentation/performance test is present in this revision. This is a source-level limitation, not a newly executed runtime test. Reconsider only if a later revision meaningfully checks the published constraint; no production/test rewrite is included here.

**Held opening:** “Would you delete the cache to fix the stale total? In this challenge, the cache has to stay.”

**Edge / opinion split:** Debate simplification versus retaining an optimization. **Actual anchor / payoff:** F’s normalized source above; case-1 checks changed quantities and case-10 checks changed/removed codes. The prompt explicitly requires keeping the memo. Deleting it may be a defensible choice in another product; it is not an accepted answer to this task.

**Spoiler risk:** Medium; names the required constraint, not invalidation sites or cache-key design. **Limits:** No actual speedup claim or assertion that retaining a cache is universally better. Output cases and the memo-field text rule do not establish performance; retain that limitation if selected.

### M · Strict rejection can break a valid retry · secondary reserve — G / API-9

**Opening:** “Reject every reused token? Two screens can race with the same login. Keep the retry working without letting an old token back in.”

**Edge / opinion split:** Strict rejection versus a bounded usability exception. **Actual anchor / payoff:** G’s normalized source above; case-2 accepts a retry after four seconds, case-3 rejects a three-day replay, and cases-7/8 check the inclusive grace boundary. The exact ordered policy is given; this is not an unspecified design ambiguity.

**Spoiler risk:** Medium; the grace requirement is public. Keep check order and implementation out of opening copy. **Limits:** Not a recommendation that every auth system use this policy. No stolen-account recovery, real pentest result or deployed protection is claimed.

## Recheck verification and remaining work

Read-only comparison verified seven current revision hashes, pinned seed anchors, keys and sole editable entries; A–G retain identical full case objects to the baseline. Source review covered each selected requirement/helper addition and each alternative’s cited cases. No runtime, seed, catalog, schema or historical-record changes. The earlier 198-test/typecheck/content-check results below apply to the original editorial commit, not execution of ENG-329’s normalized branch. This follow-up changes documentation only; focused source/link checks and whitespace validation are sufficient and do not compete with the shared heavy-check queue.

Editorial selections and constraints are recorded; this deliverable is ready for ENG-327 parent review. No more variants are needed. ENG-332 may proceed with B/C/D and A, using the final exact revisions above; final destination-revision matching and integrated flow validation remain with ENG-329/328/332 and the ENG-327 release gate. No merge or deployment.

## Historical baseline inventory · superseded for artifact mapping

The following preserves the original research and old revision references. Its proposed selection and readiness statements describe the baseline only; use the current register above for selected candidates and alternatives.

Original submission for dot’s review under ENG-327. Selection has since been recorded above.

## Source and claim boundary

Baseline: `1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8`, verified as this worktree's starting HEAD. The baseline catalog contains 46 current issues in seven projects and 68 retained revisions. This is a bounded editorial review of eight current challenge payoffs, not an audit or endorsement of all 46 challenges. Exact revision identifiers and case references below refer to `content/catalog.json` at that baseline; seed links are pinned to the same commit. Older revisions remain historical sources, not current promises.

The copy follows challenge → code → immediate diagnostic feedback → next challenge. It promises no project explorer, visible test source, hints, teammate comments, review or merge ceremony. Existing seed stories sometimes mention those things; only the problem and stated requirements are used here. Real-world settings below are authored challenge scenarios, not reports from actual companies or participants. Counts, money and dates in them are fixtures, not measured product outcomes.

Each candidate separates proposed opening copy from the internal payoff and spoiler notes. Payoff notes are for editorial review, not text to put before a player. Requirement clarity is allowed: do not conceal necessary rules to create a reveal. None of these candidates establishes single-file readiness in the revised product. ENG-329 owns normalization and diagnostic verification; ENG-328 owns presentation. Recheck the chosen candidate against their final revision before use, recording its new hash and any changed payoff. Do not rewrite a revision or migrate saved work as part of this inventory.

## Small shortlist for selection

Recommend selecting from these five, rather than publishing all of them. They cover JavaScript, SQL, Go and Python, with one optional agency question and no need for invented benchmark data.

### A · An empty post has one word — familiar bug / optional AI-use tension

**Proposed hook:** “An empty post says ‘1 word.’ Can you make the count match the text?”

**Optional agency variant:** “If you usually reach for AI, try this one yourself: make an empty post count as zero words.” This is an invitation, not an assessment of whether someone has lost skill. Dot may select the neutral version alone.

**Exact source:** QUICK-2, `word-count-javascript`, JavaScript. [Seed ticket and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/seed.ts#L590). Revision: `sha256:8a7ed6dc808d4ae5559c10a0c7d77102dcc2661ad2659c4326c8f02e08239e21`.

**Payoff / evidence:** The starter returns 1 for an empty string. `case-1` expects 0; `case-3` expects 2 for repeated and surrounding spaces; `case-5` expects 4 across tabs and newlines. The challenge is counting words according to explicit whitespace rules, not building a natural-language tokenizer. The same premise exists as QUICK-1…8 in eight languages; this row verifies the JavaScript source, not equivalence of every runner.

**Spoiler risk:** Low. The symptom and zero-word goal are already in the title/body. Keep regex, split/filter and library suggestions out of the hook.

**Unsupported gaps / readiness:** One editable entry, `src/count-words.js`, plus internal test/docs files at baseline. QUICK is unlisted and has a dedicated `/play` entry; do not promise it appears in the searchable catalog. No evidence of average solve time, AI-related decline, or what a result says about a developer's ability. “Five-minute” is positioning, not a measured guarantee. No runtime AI assistance is implied.

### B · Paid $45, refunded $40.50 — familiar money bug

**Proposed hook:** “They paid $45 for the jacket. The refund is $40.50. Make the refund match the receipt.”

**Exact source:** SHOP-5, `refund-totals`, JavaScript. [Seed ticket and supporting files](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/seed.ts#L1470). Revision: `sha256:c4b28311be0a5c974d1e377a9a64d3f1f3ed44f9c69f292a62056e0185b36314`.

**Payoff / evidence:** `case-2` expects −4500 cents for the returned jacket after its allocated discount. `case-8` covers a partial return under a fixed discount; `case-10` covers the leftover allocation cent. A correct refund gives back what was paid for the returned lines. Checkout totals must remain unchanged; this requirement is in the body.

**Spoiler risk:** Low for the hook; high for explaining that a discount is applied twice. Do not put the root cause or the refund arithmetic into opening copy.

**Unsupported gaps / readiness:** One editable entry, `src/cart/totals.js`; read-only money/discount helpers exist. The existing audit says checkout scope is enforced through a text-pattern comment rather than a second tested entry point. Removing comments must not turn this into a claim that checkout behavior was verified. This is a fixture refund, not recovered customer funds or proof of a production fix.

### C · The report loses the partner who paid nothing — SQL / surprising edge case

**Proposed hook:** “The payment report overcounts one partner—and leaves out the one who paid nothing. Fix the SQL.”

**Exact source:** DATA-6, `collected-by-partner`, SQL. [Seed ticket, schema and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/more/data-platform.ts#L260). Revision: `sha256:7a455c4e6461678ffae5ae767b85e2a9232bf4f2474642ac5ddd5117f63a3196`.

**Payoff / evidence:** `case-2` expects two $250 payments on one order to total $500. `case-3` keeps Corvid with 0 despite having no payments. `case-5` counts only the $40 collected on a $100 order; `case-6` preserves two equal $50 payments as $100. The body states one row per partner with orders, descending amount and alphabetical ties.

**Spoiler risk:** Medium. The unpaid-partner requirement is necessary clarity. Naming the join type, aggregation expression or a `DISTINCT` mistake would supply an approach; keep those out of the hook.

**Unsupported gaps / readiness:** One editable entry, `queries/collected-by-partner.sql`; the schema must remain available as problem context when test source is internal. SQL is an existing supported language, not a new catalog item. The prior fairness audit did not validate SQL alternatives/wrong fixes. No claim that a particular implementation, runtime performance or real finance reconciliation has been independently validated here.

### D · When do two email addresses mean one account? — bounded decision

**Proposed hook:** “Two sign-ups, one email address—or two different people? Build the lookup key using the stated rules.”

**Exact source:** API-8, `canonical-signup-email`, Go. [Seed requirements and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/more/accounts-api.ts#L194). Revision: `sha256:62924f856e628fab0cc713a6f6daccd9b8e359a7728b0b8108999b9cbfca8db4`.

**Payoff / evidence:** `case-3` normalizes a Gmail dotted/tagged address; `case-4` preserves an example.com tag. `case-15` and `case-16` preserve dots on domains that merely resemble Gmail. The body gives exact domains, whitespace rules, case handling and invalid-address behavior. The payoff is applying a bounded policy without widening it.

**Spoiler risk:** Low to medium. Domain-specific rules belong in the description; they are not a hidden trick. Do not publish a normalization pipeline as the hook.

**Unsupported gaps / readiness:** One editable entry, `canonical_email.go`. This is a fixed-policy coding task, not an open-ended design debate or advice for production email identity. Whole-address lowercasing is an explicit scenario assumption, not a universal email fact. No real account merge, identity validation or security outcome is demonstrated. Go fairness remains outside the prior full audit.

### E · “Same as above” stops at the page — distinctive parsing problem

**Proposed hook:** “A notebook says ‘same as above.’ On a new page, what does that mean? Read the marks without inventing missing data.”

**Exact source:** FN-5, `notebook-ditto-marks`, Python. [Seed requirements and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/more/field-notes.ts#L959). Revision: `sha256:22a76b5c4c5f9664204ab33cc31be5a1b75bc54ce38f7ee12eccc4c0227a4333`.

**Payoff / evidence:** Expand the three stated ditto forms field by field while keeping page boundaries. `case-4` reports line 4 unresolved after a heading. `case-10` reports lines 2 and 3 unresolved while still recovering an available field for the later valid row. `case-13` keeps quote/“do.” text inside a larger field literal. The rules specify this behavior; guessing is not the challenge.

**Spoiler risk:** Medium. The page-boundary rule is explicit and must stay explicit. Avoid showing state storage or the expansion algorithm. This hook deliberately reveals a requirement, not an implementation.

**Unsupported gaps / readiness:** One editable entry, `notebook/transcribe.py`, with read-only parser support. The task is transcription parsing, not handwriting recognition or AI extraction. “Three of 41 notebooks” is authored context; there is no observed volunteer time saving or actual recovered research dataset.

## Alternatives and holds

### F · Fast cart, stale total — disputed optimization / reserve

**Proposed hook:** “The cart is faster. Change the quantity and the total stays the same. Fix the total while keeping the cache.”

**Exact source:** SHOP-7, `stale-cart-summary`, JavaScript. [Seed requirements and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/more/storefront.ts#L657). Revision: `sha256:bdb1f721df1ae40ae17305d5d71b4c92508ecd7e6d927cf9f04c8ba39b0df31f`.

**Payoff / evidence:** `case-1` changes one $59 item to two and expects $118; `case-10` checks replacing/removing a discount code. Keep memoization while making summary output reflect mutations. This is a tension between two stated requirements, not an invitation to argue whether caching is desirable.

**Spoiler risk:** Medium; “keeping the cache” is required context. Avoid naming invalidation sites or a cache-key design.

**Unsupported gaps / readiness:** One editable entry, `src/cart/cart.js`. The body’s 38 ms → 2 ms story is not a measured result from this product. The prior audit flags “keep the memo” as a pattern-based review requirement, not a scaling check. Hold any performance or “both requirements verified” claim until ENG-329 confirms how that requirement survives removal of comments. No real overcharge or recovered revenue occurred.

### G · Fewer logouts, old tokens accepted — security-policy tension / reserve

**Proposed hook:** “The login fix stopped the logouts. It also lets an old token work again. Keep the grace window and reject the replay.”

**Exact source:** API-9, `refresh-token-reuse`, TypeScript. [Seed requirements and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/more/accounts-api.ts#L454). Revision: `sha256:a8cc4e1093c210a89927da708b1934e2ac7ac5a75f86b322bb6c9b0e730daef2`.

**Payoff / evidence:** `case-2` accepts a retry after four seconds; `case-3` rejects reuse after three days with family revocation. `case-7` accepts at 10,000 ms and `case-8` rejects at 10,001 ms. Other cases cover revoked/expired sessions and unknown tokens. The goal preserves the valid mobile retry while restoring the specified checks.

**Spoiler risk:** Medium. Do not publish the check order as a teaser or reduce the problem to one boundary condition. All policy requirements must be in the challenge context.

**Unsupported gaps / readiness:** One editable entry, `src/gateway/refresh.ts`, but requirements live partly in read-only `policy.ts`. Before selection, ENG-329/328 must confirm those rules are understandable without navigating source files. No code rewrite is proposed here. The pentest/alert story is a fixture, not an actual incident, deployed security fix or proof that these checks secure a production auth system. TypeScript fairness is not established by the earlier JS/Python audit.

### H · A rejected refund is missing money — recovery potential / hold

**Proposed hook:** “The statement says €59.50. The report says €75 and rejects two rows. Make the numbers agree without hiding bad input.”

**Exact source:** DATA-8, `bracketed-refunds`, Python. [Seed requirements and cases](https://github.com/ekkuleivonen/muscle-memory/blob/1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8/content/more/data-platform.ts#L567). Revision: `sha256:2f67de6d62cbc85c4ba1667172e3da03ac1cfae22e44151cd0e60f8733cbd063`.

**Payoff / evidence:** `case-2` expects 5950 cents and zero rejects for the Bluefin example. `case-4` still reports two genuinely unreadable rows. `case-7` and `case-12` ensure refunds reduce net across sign conventions. Reconciliation means accounting for valid amounts while retaining truthful rejection counts.

**Spoiler risk:** Medium to high if the copy names the sign-handling fix. Accounting-format brackets are already an explicit input requirement and must remain explained.

**Unsupported gaps / readiness:** HOLD for the single-file flow: baseline has three editable files (`pipeline/money.py`, `pipeline/readers.py`, `pipeline/report.py`), and the prior audit identifies reader sign preservation as a pattern-based requirement. Hiding two files does not establish solvability. ENG-329 must supply a normalized revision/contract before use. This gives a recovery-shaped coding problem; there is no observed participant recovery story, real payout released or production reconciliation. Do not claim those outcomes.

## Coverage and editorial decision

Familiar bugs: A/B. Bounded decisions: D/F/G; none is an open-ended architecture vote. AI-use tension: optional A wording only. Surprising edge cases: C/E. Recovery: H is a held reconciliation problem; actual human recovery is unsupported across this source set. An attempted solution failing and later passing would require an actual, permitted evidence record before it could become a participant story. Do not invent a person, quote, struggle, completion time or success rate.

Dot's remaining decision: select a small subset from A–E (or a reserve once its gap is resolved), choose neutral or optional agency wording for A, and approve the final copy after the integration revision check. No public campaign, new challenge, model comparison, skill assessment, consent change or runtime feature is authorized by selection alone. ENG-330 can use the chosen premise in the story; ENG-332 can use it for specific challenge sharing without adding a solution or unverified outcome.

## Verification and limits

Source review compared each candidate's body, editable paths and cited cases/expected results against its current baseline catalog revision and seed. The [existing content audit](audits/content-2026-10-25.md) supplies the stated fairness and pattern-rule limitations; it is not replaced or broadened here. No production code, seed, generated catalog or historical revision was changed.

Local checks passed on Node 22.23.3: `npm test` (198/198), `npm run typecheck`, and `npm run check:content`. A read-only source check confirmed all eight challenge keys, full revision hashes, pinned seed anchors and cited case IDs. `git diff --check` passed. No new runtime tests were added for this editorial document.

Editorial verification does not demonstrate fresh arrival, first edit, diagnostics, completion, next challenge, stale-code handling, reload/resume or recipient sharing in the revised flow. Those integration checks belong to ENG-328/329/332 and the ENG-327 release gate. No browser screenshots or runtime/publication verification are claimed for this document.
