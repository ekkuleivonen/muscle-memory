# ENG-329 single-file normalization audit

Read-only audit of the 46 published challenges (live revisions in `content/catalog.json`), for the direction "one editable file, no explorer, no visible test source, no hints or comments". Reproduce it with `node --import tsx tools/audit/single-file.ts`. Ground truth for "what must be edited" is each challenge's private reference solution, the same one `npm run check:publish` runs. All 46 have one.

**Status: implemented** (approved by dot). The contract is enforced at publish (`packages/content/publish.ts`), and every live challenge was rewritten through the seed and rebuilt. The changed revisions are listed at the end. Rule decisions made along the way:

- **Dropped (existed only to force the second-file edit):** FN-3 `mateo-units-in-report` and DATA-8 `priya-reader-sign`. DATA-8's description no longer claims anything about the reader's rows: only `settlement_summary`'s result is checked, so only it is the contract (review fix).
- **Kept, trigger changed:** SHOP-8 `mateo-line-taxes` requires an actual call to `lineTaxes`, with any spacing before the bracket, and never counts its definition (`(?<!function\s+)\blineTaxes\s*\(`). An alternative with spaced calls passes; an unused helper, even spaced, is blocked (review fix).
- **Stated but not tested by any case:** EDGE-1 "no malloc on the hot path" and EDGE-2 "fast with two million samples" came from ticket comments; they are requirements in the description, not enforced.
- **Hidden case names:** INC-1's seven hidden case names (which stated the answers) are now blank.

Languages: Python 10, Go 7, JavaScript 6, TypeScript 6, PHP 3, SQL 3 (DATA-3, DATA-4, DATA-6), Java 2, C# 2, Ruby 2, C 2, C++ 2, HTML 1.

## Findings

| #   | Finding                                                                                                           | Challenges                                                                                                                                   | Why it matters for one file                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **The solution needs two files.** The reference changes the entry and a second editable file.                     | FN-3 (`report.py` + `units.py`), SHOP-8 (`receipt.ts` + `tax.ts`), DATA-8 (`report.py` + `readers.py`)                                       | Unsolvable through the entry alone. Hiding the second file would make them impossible.                                                                                                                                                                                                |
| B   | **A second editable file is never needed.**                                                                       | INC-1 (`shipping.js` editable, untouched by the reference)                                                                                   | Make it support code.                                                                                                                                                                                                                                                                 |
| C   | **The entry imports read-only support code** the player could read before.                                        | INC-1, FN-2, FN-3, FN-4, FN-5, SHOP-5, SHOP-6, SHOP-7, SHOP-8, API-9, DATA-7                                                                 | With no explorer, the helpers' API (names, units, return shapes) has to be stated in the description or inlined into the entry. Otherwise the player calls functions they can't see.                                                                                                  |
| D   | **The requirement lives in a non-README doc or log.**                                                             | EDGE-5 (`docs/vhosts.md`), EDGE-6 (`docs/weighted-balancing.md`), EDGE-7 (`docs/412-cache-index.md`), INC-1 (`logs/checkout-api.log`)        | The description names these files, so the rule they hold must move into the description.                                                                                                                                                                                              |
| E   | **SQL schema lives in `db/schema.sql`.**                                                                          | DATA-3, DATA-4, DATA-6                                                                                                                       | The tables and columns must be in the description (they're also `workspace.schema`, so the runner is unaffected). SQL stays first-class.                                                                                                                                              |
| F   | **The description names other files.**                                                                            | INC-1, FN-2, FN-3, SHOP-8, API-9, DATA-7, DATA-8, EDGE-5, EDGE-6, EDGE-7                                                                     | The wording has to stop pointing at files the player can't open.                                                                                                                                                                                                                      |
| G   | **Correctness and safety rules live in teammate review comments** (`severity: blocking`, deterministic triggers). | 17 rules in 17 challenges: INC-1, FN-1 to FN-5, SHOP-5, SHOP-7, SHOP-8 (2), API-7, API-9 (2), DATA-6, DATA-7, DATA-8, EDGE-5, EDGE-6, EDGE-7 | With comments gone, each must become a **stated requirement in the description**, still enforced by its existing deterministic trigger and shown as a required rule in the check feedback. Dropping it would silently remove a requirement (dot: correctness and safety still block). |
| H   | **Opening ticket comments (`where: issue`, `info`).**                                                             | All 46 (1 to 3 each)                                                                                                                         | They may clarify requirements. Each needs an editorial pass: fold anything requirement-bearing into the description, drop the rest.                                                                                                                                                   |
| I   | **Hints: 61 across 33 challenges.**                                                                               | 33                                                                                                                                           | Removed at runtime per the direction. Each needs a check that no requirement exists only in a hint.                                                                                                                                                                                   |
| J   | **Hidden case names state their answers.**                                                                        | INC-1 (7 named hidden cases, e.g. "guest at exactly $50: free shipping")                                                                     | The components already hide hidden names. The content fix is to drop or neutralize them.                                                                                                                                                                                              |
| K   | **Test files (`role: tests`)**, one per challenge                                                                 | 46                                                                                                                                           | Become internal; nothing to normalize. The visible cases are the shown examples.                                                                                                                                                                                                      |

## Proposed bounded contract

1. **The entry is the one editable file.** A challenge is supported for single-file play when its reference changes only `workspace.entry` (A and B fixed). `tools/audit/single-file.ts` becomes a content-check rule in `packages/content/validate.ts`: every editable file other than the entry fails publishing. That's a validator change for dot to approve.
2. **Support code stays internal and runs as today.** `read` files still load at run time, but any API the entry relies on is documented in the description (C).
3. **Everything required is in the description.** That covers rules from docs and logs (D), SQL tables (E), blocking rules restated as requirements (G), and requirement-bearing ticket comments and hints (H, I). The description stops naming files (F).
4. **Deterministic rules keep enforcing.** The `team[].when` triggers stay as they are and still block completion through the merge gate's `review` blocker. Only the persona, the reply and Resolve go. The practice area shows the requirement text, not a teammate's message.
5. **Shown examples are the visible cases.** Hidden cases stay hidden (already in the components).

## Order and effort (estimate, not validated)

- **Fix first, unsolvable as one file:** FN-3, SHOP-8, DATA-8. Fold the second file's required change into the entry, then re-run `check:publish`.
- **Mechanical:** INC-1's `shipping.js` becomes `read`. E (3 SQL challenges) and F are mostly description edits.
- **Editorial, needs judgement:** C (11), D (4), G (17 rules), H (46), I (33), J (INC-1).

**Until a challenge is normalized, ENG-328 can keep it out of single-file play** (as "not ready yet"), rather than hiding a file whose edit is required. The list for that is in the table: A today, then whichever of C to I aren't done yet.

## What this does not claim

- Static facts only; nothing was run in a browser.
- "Solvable through the entry" is proven for the 43 challenges outside A only in that their reference changes just the entry. Whether every description is clear enough without hints and comments needs the editorial pass in H and I.
- No content was changed and no new challenge was added.

## Changed revisions (ENG-329 normalization)

Every live revision changed; every earlier revision stays published (`apps/web/lib/pre-single-file-revisions.json` maps each issue to its revision from just before). IDs are shortened (`sha256:` prefix and first 12 hex digits).

| Key     | Issue                        | Before         | Live now       | Editable files | Hints removed | Comments removed | Blocking rules kept                  |
| ------- | ---------------------------- | -------------- | -------------- | -------------- | ------------- | ---------------- | ------------------------------------ |
| INC-1   | `checkout-guest-shipping`    | `42925e35d9dc` | `4adab133b9ea` | 2 → 1          | 2             | 4                | `catch-hides-guests`                 |
| QUICK-1 | `word-count-python`          | `39b6a8314930` | `936b6f0f6f9f` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-2 | `word-count-javascript`      | `8a7ed6dc808d` | `55f86f1b8bf7` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-3 | `word-count-typescript`      | `402621622d97` | `191a18cef55e` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-4 | `word-count-go`              | `6a561cd5f720` | `3c2f96232871` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-5 | `word-count-java`            | `b5bdc36df699` | `82e91363932c` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-6 | `word-count-csharp`          | `579f23bb7573` | `a982b8493dfa` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-7 | `word-count-ruby`            | `99dc4c3c18fc` | `2a4d893ed878` | 1 → 1          | 2             | 1                | —                                    |
| QUICK-8 | `word-count-php`             | `e82dff4fe496` | `fa160ce08d0e` | 1 → 1          | 2             | 1                | —                                    |
| FN-1    | `frequency-map`              | `34973b6b6ded` | `7c1acfdddb7a` | 1 → 1          | 2             | 2                | `priya-debug-print`                  |
| FN-2    | `species-tally-shared-names` | `061c44f7b453` | `6c6646be7ec2` | 1 → 1          | 2             | 2                | `priya-shared-helper`                |
| FN-3    | `length-report-inches`       | `a96ac4ef5192` | `862bd1329f8e` | 2 → 1          | 2             | 3                | —                                    |
| FN-4    | `site-summary-groupby`       | `18e35b69f04a` | `3ae2e61f48db` | 1 → 1          | 2             | 2                | `priya-rescan`                       |
| FN-5    | `notebook-ditto-marks`       | `22a76b5c4c5f` | `30bf6730b7b3` | 1 → 1          | 2             | 3                | `priya-transcribe-print`             |
| SHOP-1  | `format-price`               | `939c40f234b0` | `9b1edd1b9174` | 1 → 1          | 0             | 1                | —                                    |
| SHOP-2  | `discount-codes`             | `bac681acd011` | `d28680b6178c` | 1 → 1          | 0             | 2                | —                                    |
| SHOP-3  | `filter-form-labels`         | `8f708a689299` | `b9d18c48ab6b` | 1 → 1          | 0             | 1                | —                                    |
| SHOP-4  | `debounce-search`            | `b609f5132431` | `957e830d1200` | 1 → 1          | 1             | 1                | —                                    |
| SHOP-5  | `refund-totals`              | `c4b28311be0a` | `68ed6a0dcc9d` | 1 → 1          | 2             | 2                | `ada-order-total`                    |
| SHOP-6  | `free-shipping-banner`       | `e244ffe65bc0` | `f37d06e59e92` | 1 → 1          | 2             | 4                | —                                    |
| SHOP-7  | `stale-cart-summary`         | `bdb1f721df1a` | `b6c151c3f9ec` | 1 → 1          | 2             | 3                | `ada-keep-memo`                      |
| SHOP-8  | `receipt-tax-split`          | `675596eb25cb` | `2fd025fb6c47` | 2 → 1          | 3             | 4                | `mateo-line-taxes`, `mateo-to-fixed` |
| API-1   | `pagination-params`          | `0ac43ce5c978` | `8405f3d99a66` | 1 → 1          | 0             | 1                | —                                    |
| API-2   | `reset-link-expiry`          | `dd747fae33d5` | `4daaf106a045` | 1 → 1          | 0             | 1                | —                                    |
| API-3   | `rate-limiter`               | `4bdbc7acd15b` | `d5f535f60c66` | 1 → 1          | 1             | 1                | —                                    |
| API-4   | `parse-log-line`             | `875c2340ec87` | `096707a93813` | 1 → 1          | 0             | 2                | —                                    |
| API-5   | `workspace-slugs`            | `ff9c83ee33b8` | `5d25cd1857e3` | 1 → 1          | 1             | 1                | —                                    |
| API-6   | `password-policy`            | `3dce7dc561b8` | `a0fea8e24388` | 1 → 1          | 0             | 1                | —                                    |
| API-7   | `lockout-retry-message`      | `ffb2b4bc3f78` | `4a45e413a87d` | 1 → 1          | 2             | 2                | `mateo-round-down`                   |
| API-8   | `canonical-signup-email`     | `62924f856e62` | `a7d434b1858e` | 1 → 1          | 2             | 4                | —                                    |
| API-9   | `refresh-token-reuse`        | `a8cc4e1093c2` | `6045d32f4490` | 1 → 1          | 2             | 3                | `mateo-keep-grace`, `sam-no-console` |
| DATA-1  | `csv-quoted-fields`          | `c00f849f7bdf` | `3ca44c2f6000` | 1 → 1          | 0             | 1                | —                                    |
| DATA-2  | `dedupe-customers`           | `408b958d7b63` | `a974f21dbee5` | 1 → 1          | 0             | 1                | —                                    |
| DATA-3  | `top-customers`              | `1a04756697b8` | `a8d2b8db0f02` | 1 → 1          | 0             | 1                | —                                    |
| DATA-4  | `unpaid-orders`              | `f8f5a7fc8038` | `ca8f9f29f507` | 1 → 1          | 1             | 1                | —                                    |
| DATA-5  | `late-fee-rounding`          | `4329b9cf7754` | `f9fdd679d880` | 1 → 1          | 1             | 1                | —                                    |
| DATA-6  | `collected-by-partner`       | `7a455c4e6461` | `de8621e616e7` | 1 → 1          | 2             | 2                | `priya-sum-distinct`                 |
| DATA-7  | `dedupe-phone-customers`     | `c524922bdcd7` | `70941e23d1f9` | 1 → 1          | 2             | 3                | `priya-pairwise`                     |
| DATA-8  | `bracketed-refunds`          | `2f67de6d62cb` | `5d9a5155881d` | 3 → 1          | 2             | 4                | —                                    |
| EDGE-1  | `ring-buffer`                | `ca784ee406e2` | `ceedbc834572` | 1 → 1          | 0             | 1                | —                                    |
| EDGE-2  | `p99-latency`                | `467834317f13` | `8851fe342864` | 1 → 1          | 0             | 1                | —                                    |
| EDGE-3  | `lru-cache`                  | `fd4017b09f9f` | `3fe599731b07` | 1 → 1          | 1             | 1                | —                                    |
| EDGE-4  | `parse-duration`             | `2a664f5258fd` | `29ee4f465695` | 1 → 1          | 0             | 1                | —                                    |
| EDGE-5  | `ipv6-host-header`           | `175839700669` | `e2cafd032130` | 1 → 1          | 2             | 3                | `sam-no-malloc`                      |
| EDGE-6  | `weighted-upstreams`         | `ee1f7031092c` | `8a787b078def` | 1 → 1          | 2             | 4                | `mateo-keep-lock`                    |
| EDGE-7  | `cache-index-purge`          | `a6568afbb3ad` | `57eba8fdb713` | 1 → 1          | 2             | 4                | `mateo-flat-table`                   |
