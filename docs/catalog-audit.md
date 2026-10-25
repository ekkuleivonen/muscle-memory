# Catalog audit, October 2026

A snapshot of the challenge catalog: what exists, what each challenge needs, what changed in place, and what to add next. It audits `main` at `961dd9b` (46 challenges, 12 languages) plus the fixes in the same change. It is a content review backed by sandbox runs, not a claim that every challenge has been played by a person; playing each one is ENG-338. New challenges are ENG-336.

## Method

- Read every `task.md`, starter, `cases.json`, `rules.json` and `private/` folder.
- Ran `npm run check:publish` on all 46 at `961dd9b` (all passed), then on every changed key after the fixes.
- Gave every challenge outside JavaScript and Python, which had only a reference solution, an alternative and at least two plausible wrong solutions. Each mistake that passed every case was a case gap: it was fixed with a hidden case, and the mistake is kept as a wrong solution so the gap stays closed.
- Judged each task by one test: can someone who reads it once say what to return? Kept a story only where it carries a fact the solver needs, such as a log line that shows the bug or a partner note that defines a format.

## Languages

| Language | Key | Runtime (in the browser sandbox) | Challenges | Easy / medium / hard |
| --- | --- | --- | --- | --- |
| Python | PY | Pyodide (CPython 3.14, standard library only) | 10 | 4 / 4 / 2 |
| Go | GO | Yaegi | 7 | 4 / 3 / 0 |
| JavaScript | JS | the browser's engine | 6 | 4 / 2 / 0 |
| TypeScript | TS | the browser's engine, types stripped by Sucrase | 6 | 2 / 2 / 2 |
| PHP | PHP | php-wasm | 3 | 3 / 0 / 0 |
| SQL | SQL | PGlite (PostgreSQL) | 3 | 2 / 1 / 0 |
| C | C | Clang (YoWASP) | 2 | 1 / 1 / 0 |
| C++ | CPP | Clang (YoWASP) | 2 | 0 / 0 / 2 |
| C# | CS | Roslyn on .NET | 2 | 2 / 0 / 0 |
| Java | JAVA | teavm-javac | 2 | 2 / 0 / 0 |
| Ruby | RB | ruby.wasm | 2 | 2 / 0 / 0 |
| HTML | HTML | linkedom | 1 | 1 / 0 / 0 |
| **Total** | | 12 runtimes | **46** | **27 / 13 / 6** |

Every challenge is runnable: each has a runtime, and its solution passes in the sandbox. `RS` (Rust) is still in `packages/content/keys.ts` and highlighted in the editor, but has no runtime, no challenge and is not offered in setup. Don't add Rust content until it has a runtime.

## Matrix

Revision is the live revision after this audit and the final integration corrections (first 12 hex digits of its hash). Cases are examples + hidden. Private is alternatives / wrong solutions.

| Key | Revision | Title | Difficulty | Tags | Runtime | Cases | Rules | Private |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-001 | `35464d4a9a60` | Normalize Host headers, IPv6 literals included | easy | strings, parsing, http | Clang | 5+17 | 1 | 1/7 |
| C-002 | `4899b029c3c8` | Keep the last N request latencies in memory | medium | arrays, modular-arithmetic | Clang | 2+14 | 0 | 1/3 |
| CPP-001 | `63cd99a0b96a` | Cache evicts entries that were just used | hard | caching, linked-lists, maps | Clang | 2+13 | 0 | 1/3 |
| CPP-002 | `b60f7273efa7` | Open-addressing index loses keys after a purge | hard | hash-tables, caching, reading-code | Clang | 5+13 | 1 | 1/3 |
| CS-001 | `1eb2bc05c432` | The composer says 1 word when the post is empty | easy | strings, edge-cases | Roslyn/.NET | 5+16 | 0 | 1/3 |
| CS-002 | `790005e37bae` | Late fees are a cent off on some invoices | easy | rounding, decimals, finance | Roslyn/.NET | 6+17 | 0 | 1/3 |
| GO-001 | `d73f7e05a154` | The composer says 1 word when the post is empty | easy | strings, edge-cases | Yaegi | 5+16 | 0 | 1/3 |
| GO-002 | `3c10fd7c2fe8` | List endpoints accept any page size | easy | parsing, validation, http | Yaegi | 4+14 | 0 | 1/3 |
| GO-003 | `23419d0a4b0b` | Access log parser drops fields on 5xx lines | easy | parsing, strings | Yaegi | 2+13 | 0 | 1/2 |
| GO-004 | `bd709be6d357` | Timeouts in config must be written in seconds | easy | parsing, config | Yaegi | 6+18 | 0 | 1/3 |
| GO-005 | `6284f2295fb1` | Sign-up creates a second account for the same email | medium | strings, validation, normalization | Yaegi | 5+15 | 0 | 1/4 |
| GO-006 | `2279a86fff5b` | Compute nearest-rank percentiles for the latency panel | medium | sorting, statistics | Yaegi | 4+15 | 0 | 1/3 |
| GO-007 | `e566002e3c3b` | Upstream weights are ignored | medium | load-balancing, concurrency, algorithms | Yaegi | 5+11 | 1 | 1/3 |
| HTML-001 | `e6472fd87067` | Product filter checkboxes have no labels | easy | accessibility, forms, semantics | linkedom | 4+12 | 0 | 1/4 |
| JAVA-001 | `e9b1f62267ac` | The composer says 1 word when the post is empty | easy | strings, edge-cases | teavm-javac | 5+16 | 0 | 1/4 |
| JAVA-002 | `e66f30751757` | Password policy still allows 8-character passwords | easy | validation, strings, security | teavm-javac | 5+17 | 0 | 1/6 |
| JS-001 | `4e3890b9a4fc` | Guest checkout fails with a server error | easy | debugging, reading-logs | browser JS | 3+7 | 1 | 2/6 |
| JS-002 | `2c358ce3b845` | The composer says 1 word when the post is empty | easy | strings, edge-cases | browser JS | 5+16 | 0 | 2/2 |
| JS-003 | `59980dd4271a` | Cart shows prices as raw cents | easy | formatting, strings, numbers | browser JS | 5+13 | 0 | 2/2 |
| JS-004 | `0f48fac293b5` | Show how far the cart is from free shipping | easy | money, reading-code, ui-copy | browser JS | 5+11 | 0 | 1/3 |
| JS-005 | `6320a78f5159` | Refunds give back less than the customer paid | medium | debugging, money, reading-code | browser JS | 3+14 | 1 | 3/3 |
| JS-006 | `8082598a59e1` | Cart drawer shows the old total after changing quantity | medium | caching, debugging, reading-code | browser JS | 5+11 | 1 | 2/2 |
| PHP-001 | `883834c79dad` | The composer says 1 word when the post is empty | easy | strings, edge-cases | php-wasm | 5+16 | 0 | 1/4 |
| PHP-002 | `07b2c479fd24` | Password reset links expire after a minute | easy | time, units | php-wasm | 4+12 | 0 | 1/2 |
| PHP-003 | `835747406459` | Lockout message tells people to try again in 0 minutes | easy | time, rounding, copy | php-wasm | 5+13 | 1 | 1/3 |
| PY-001 | `1478c6f5aea2` | The composer says 1 word when the post is empty | easy | strings, edge-cases | Pyodide | 5+16 | 0 | 2/2 |
| PY-002 | `0bca3c710baa` | Count how often each string appears | easy | iteration, maps, edge-cases | Pyodide | 4+11 | 1 | 2/3 |
| PY-003 | `f6cad67e20e3` | Herbarium import creates duplicate species from the tally sheet | easy | refactoring, reading-code, strings | Pyodide | 5+12 | 1 | 1/2 |
| PY-004 | `9ee05a3f865d` | CSV import splits company names on commas | easy | parsing, strings, csv | Pyodide | 4+14 | 0 | 2/3 |
| PY-005 | `3b8d9edb5d37` | Length report crashes on the Oregon volunteers' sheets | medium | debugging, parsing, units | Pyodide | 5+12 | 0 | 1/3 |
| PY-006 | `4f006c4a24df` | Site summary undercounts since last week's speed-up | medium | debugging, reading-code, iteration | Pyodide | 5+12 | 1 | 1/2 |
| PY-007 | `e8a8cfef1e39` | Deduplicate customer records by email | medium | maps, data-cleaning | Pyodide | 2+13 | 0 | 2/3 |
| PY-008 | `27a612b805df` | Active customers report is short 212 customers | medium | debugging, data-cleaning, reading-code, maps | Pyodide | 5+11 | 1 | 1/2 |
| PY-009 | `697c865602b3` | Volunteers have to expand ditto marks by hand | hard | parsing, state, edge-cases | Pyodide | 5+12 | 1 | 1/3 |
| PY-010 | `8969155c54b3` | Bluefin settlements don't match their statements | hard | debugging, parsing, money, reading-code | Pyodide | 5+11 | 0 | 1/3 |
| RB-001 | `841e463333b9` | The composer says 1 word when the post is empty | easy | strings, edge-cases | ruby.wasm | 5+16 | 0 | 1/3 |
| RB-002 | `16a31aca47c2` | Workspace URLs break on names with accents | easy | strings, unicode, urls | ruby.wasm | 5+19 | 0 | 1/3 |
| SQL-001 | `c7146b957f34` | Revenue by customer for the monthly report | easy | aggregation, sorting | PGlite | 1+14 | 0 | 1/5 |
| SQL-002 | `8069f186eae8` | Collected-by-partner report overstates split payments | easy | joins, aggregation, reconciliation | PGlite | 5+11 | 1 | 1/5 |
| SQL-003 | `4cb69977e6d6` | Find orders with no matching payment | medium | joins, reconciliation | PGlite | 1+14 | 0 | 2/3 |
| TS-001 | `87f3834b8d08` | The composer says 1 word when the post is empty | easy | strings, edge-cases | browser JS + Sucrase | 5+16 | 0 | 1/3 |
| TS-002 | `a035e776c48a` | Discount codes fail when typed in lowercase | easy | strings, validation | browser JS + Sucrase | 4+15 | 0 | 1/4 |
| TS-003 | `49b3238dff45` | Search box sends a request on every keystroke | medium | timing, events | browser JS + Sucrase | 3+15 | 0 | 1/3 |
| TS-004 | `0a4a87c203c1` | Rate-limit login attempts | medium | sliding-window, queues | browser JS + Sucrase | 3+15 | 0 | 1/3 |
| TS-005 | `f718959a5bcb` | Receipt tax lines don't add up to the tax charged | hard | money, rounding, debugging, reading-code | browser JS + Sucrase | 5+11 | 2 | 2/3 |
| TS-006 | `1939c20f182b` | Old refresh tokens work again since the grace window | hard | security, sessions, reading-code | browser JS + Sucrase | 6+11 | 2 | 1/4 |

## Verdicts

**Keep** means unchanged except for private checks. **Rewrite** means the task changed in place, so the challenge has a new revision with the same problem. **Cases** means hidden cases were added for a gap, which also makes a new revision. No challenge needed **replace** (retire and add a new key); the duplicates below are kept and should not be extended.

| Key | Verdict | Prerequisites | Why |
| --- | --- | --- | --- |
| C-001 | Rewrite + cases | C strings, fixed buffers | Opening was an on-call timeline; now the goal and the two wrong outputs. A last-`:` port cut passed; `example.com:80:443` added. |
| C-002 | Keep | arrays, modular arithmetic | Short and exact. |
| CPP-001 | Keep | hash map + linked list, LRU | Classic, clearly specified. |
| CPP-002 | Rewrite + cases | open addressing, deletion | Deploy figures and ticket replaced by a four-line log that shows the bug. Negative (unsigned) key case added. |
| CS-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| CS-002 | Cases | decimal vs double, rounding | A `double` solution passed; three half-cent cases added. |
| GO-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| GO-002 | Keep | query parsing, defaults | Clear rules. |
| GO-003 | Keep | string splitting | Clear; easy. |
| GO-004 | Keep | parsing, validation | Explicit grammar and error list. |
| GO-005 | Cases | strings, normalisation | ASCII-only whitespace check passed; a no-break space case added. Overlaps PY-007/PY-008 (email keys) but tests a different rule set. |
| GO-006 | Keep | sorting, nearest rank | Formula given; easy for medium. |
| GO-007 | Rewrite | smooth weighted round robin, mutex | Trimmed the rollout dates; the upstream block and 50.2% stay because they show the bug. |
| HTML-001 | Keep | labels, `for`/`id` | Only HTML challenge; clear. |
| JAVA-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| JAVA-002 | Keep | strings, character classes | Unicode length/letter reading unspecified (see uncertainty). |
| JS-001 | Rewrite | null handling, objects | Shop, ticket and order number removed; said helpers were imported and fixed, though they are in the file. |
| JS-002 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| JS-003 | Keep | number formatting | Clear examples. |
| JS-004 | Keep | money, reading helpers | Copy table is exact. |
| JS-005 | Rewrite | money, reading code | Dropped the help-desk preamble; the receipt stays. |
| JS-006 | Keep | memoisation, invalidation | Shopper report is the clue. Tag `code-review` → `reading-code`. |
| PHP-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| PHP-002 | Keep | units | A one-line fix; fine as an easy warm-up. |
| PHP-003 | Keep | rounding up, plurals | Clear; rule matches the task. |
| PY-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| PY-002 | Rewrite | dicts, iteration | Vial-scanner fiction replaced by the goal and one example; same cases. |
| PY-003 | Keep | reading helpers, dicts | The import log shows exactly what goes wrong. |
| PY-004 | Keep | CSV quoting | The loaded row shows the bug. |
| PY-005 | Keep | parsing, units, stats | Traceback and format are the input spec. |
| PY-006 | Keep | single pass, dicts | Quote gives the two symptoms. |
| PY-007 | Keep | dicts, Unicode case folding | Overlaps PY-008; easier, different rule. |
| PY-008 | Keep | dicts, merging | Spot-check table is the clue. |
| PY-009 | Keep | state machines, parsing | Long but every paragraph is a rule. |
| PY-010 | Keep | parsing, money | Partner note defines the bracket format. |
| RB-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| RB-002 | Cases | Unicode normalisation, regex | Mid-word combining accent and unspaced scripts/emoji added. |
| SQL-001 | Keep | GROUP BY, ORDER BY | Ties unspecified but never tested. |
| SQL-002 | Keep | LEFT JOIN, COALESCE, ties | Quote gives both symptoms; overlaps SQL-003's tables. |
| SQL-003 | Cases | anti-join | A zero-sum reading passed; zero and netting payments added. |
| TS-001 | Cases | strings | Word-count warm-up; lone `\r` and the word `0` added. |
| TS-002 | Keep | strings, lookups | Clear; case-only duplicate codes unspecified. |
| TS-003 | Cases | timers, debounce | Gap of exactly `waitMs` added. |
| TS-004 | Cases | sliding window | Rejected attempts counted passed; case added and starter comment fixed. |
| TS-005 | Keep | rounding, largest remainder | The receipt shows the mismatch. |
| TS-006 | Rewrite | token rotation, rule order | Ticket and pentest dates replaced by what broke. Tag `code-review` dropped. |

## Findings

**Workplace fiction.** Most tasks lead with the goal. These led with incidents, ticket numbers or named colleagues that the solver had to read past:
- PY-002 dressed up counting strings as a vial scanner's nightly sheet.
- C-001 opened with an on-call timeline.
- CPP-002 opened with CPU and hit-ratio figures from a deploy.
- JS-001 named a shop, a ticket and an order number.
- TS-006 named a ticket and pentest dates.

Each now opens with what the code does and a concrete example of the bug. The tags `code-review` and `reviewing-changes`, left over from the old pull-request framing, are now `reading-code`.

**Stories that stay.** The rest keep their context because it carries the clues:
- PY-008's spot-check table shows which customers go missing.
- PY-010's partner note defines bracketed amounts.
- SQL-002's quote gives both symptoms.
- PY-005 to PY-009 share a field-notebook format that the task defines.

**Case gaps.** These plausible mistakes passed every case before this audit:
- Word count (all 8 languages): treating only space, tab and newline as whitespace (a lone `\r`); dropping a word that is `"0"` (PHP's `array_filter`).
- CS-002: computing in `double`, where 0.035 rounds to 0.03.
- RB-002: dropping a combining accent mid-word; deleting other scripts and emoji instead of turning them into a hyphen.
- TS-003: a keystroke exactly `waitMs` after the last one.
- TS-004: counting rejected attempts toward the limit.
- SQL-003: reading "no payment" as "payments add up to 0".
- C-001: cutting a hostname's port at the last `:` instead of the first.
- GO-005: rejecting only ASCII whitespace.
- CPP-002: no case had a negative key. The task now explicitly allows them and defines the unsigned home-slot calculation.

**Wording.** JS-001 told the solver that the helpers were imported and could not be changed, though they sit in the same file under "you shouldn't need to change them". Its single-file wording is fixed. TS-004's starter comment now says "allowed attempts", matching the task.

**Duplicates.**
- The word-count warm-up exists in 8 languages (PY-001, JS-002, TS-001, GO-001, JAVA-001, CS-001, PHP-001, RB-001). They are kept as each language's easy entry point and share one case list.
- PY-007, PY-008 and GO-005 all dedupe or canonicalise email addresses.
- SQL-002 and SQL-003 are both orders × payments joins.
- CPP-001, CPP-002 and JS-006 are all caches.

None of these needs replacing. New challenges shouldn't add to them.

**Single file.** Every challenge is one file. Helpers sit below the function in that file. No task needs another file, test sources, hints, comments or a pull request. Some file paths still carry a directory (`src/main/java/com/acme/…`, `queries/…`); that is only the file's name. The Java package name is needed by the adapter, so it stays.

## Limits and final integration corrections

- Nobody has played these as a reader study. Clarity verdicts are one reviewer's reading.
- Case coverage is only as good as the mistakes tried. Every challenge now has at least two wrong solutions, but mistakes nobody thought of can still pass.
- JAVA-002 now states Java UTF-16 length and Character classification explicitly. Unicode digit/letter, supplementary-character length and Unicode whitespace cases distinguish the interpretations, with wrong variants retained.
- SQL-001 now specifies customer-name ordering when revenue ties. Both SQL-001 and SQL-002 have explicit tied-total cases and descending-name wrong variants; no SQL-text pattern is required.
- TS-002 now states that configured names are nonempty, unpadded and unique ignoring case; conflicting configuration is outside the stated input domain.
- C-001 now supplies the logical output capacity as a second case argument. Zero-size, undersized, exact-fit and trailing-dot exact-fit cases exercise the existing buffer contract. Backing storage stays large enough to evaluate an incorrect write safely; the returned length must match the result and fit the logical capacity. Only the specified -1 return becomes null; invalid success lengths use a distinct failing value. Returned content is not truncated to fake success. Its alternative was corrected to measure the normalized result before checking capacity.
- PHP-003 says lockouts run from one minute, while cases and the task use 30 seconds left; that is time left, not the lock's length, so it is consistent, just easy to misread.
- Generated output (`content/catalog.json`) is not committed. Revisions in the matrix are what `npm run build:content` produced for this change.

## Plan for new challenges (ENG-336)

In priority order:

1. **HTML (1 → 3 or more):** document structure and headings, a data table with header cells, form validation attributes. Use the existing selector/read cases.
2. **C, C++, C#, Java, Ruby (2 → 3–4 each):**
   - C: arrays or structs, not strings or caches.
   - C++: an easy or medium STL problem, to balance two hards.
   - C#: a medium grouping problem.
   - Java: a medium collections problem.
   - Ruby: a medium hash or enumerable transform.
3. **SQL (3 → 4–5):** `GROUP BY … HAVING`, a window function, date bucketing. Not another orders × payments join.
4. **PHP (3 → 4):** a medium. All three are easy, and two are about time.
5. **Skills nobody practises yet:** recursion or trees, graph search, interval merging, regex-first parsing. There is no hard challenge outside C++, Python and TypeScript.

Write them the way the rewrites above read:
- Lead with the goal and an example. Add a story only where it explains the input.
- No ticket numbers, named colleagues or incident timelines.
- Keep everything in one file.
- State every constraint in the task, and back it with a rule.
- Every language's `private/` names a solution, an alternative and two plausible wrong solutions. The content build now requires this for every language.
