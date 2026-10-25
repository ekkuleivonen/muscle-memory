# ENG-336: language coverage expansion

Base: exact main `961dd9b2f26d20e4382eb803411d0d3216cfbb8a` (46 challenges).
This change adds 23 permanent keys, for 69 challenges. Existing challenge folders,
IDs and archived revisions are preserved. `content/catalog.json` remains generated
and uncommitted. Each new task, starter, adapter/schema and case set is recorded
in an immutable content-hash revision; private solutions never enter the catalog.

## Supported languages and targets

The supported set is the intersection of the baseline inventory and the actual
`RUNNABLE_LANGUAGES` in `packages/runner/engines.ts`: 12 languages, including SQL.
Rust has a reserved key code but no engine or baseline content; it is excluded.
The [ENG-335 early audit](https://linear.app/rowandreason/issue/ENG-335/audit-challenge-coverage-and-remove-old-workplace-bias)
confirmed the baseline and recommended avoiding further word-count warm-ups,
email deduplication, caches and orders/payments joins. These additions avoid
those repeats and add easy/medium C++ choices alongside its existing hard tasks.

Target: at least five challenges per runnable language, retaining all existing
coverage above five. There is no actual language-demand dataset available in this
repository or the audit handoff, so this plan makes no popularity claims and adds
no filler to Go, JavaScript, Python or TypeScript. Broader coverage can follow
observed demand. The minimum requested floor of three is exceeded everywhere.

| Language   | Baseline | Added keys (reserved once) | Final target/count |
| ---------- | -------: | -------------------------- | -----------------: |
| C          |        2 | C-003–C-005                |                  5 |
| C++        |        2 | CPP-003–CPP-005            |                  5 |
| C#         |        2 | CS-003–CS-005              |                  5 |
| Go         |        7 | —                          |                  7 |
| HTML       |        1 | HTML-002–HTML-005          |                  5 |
| Java       |        2 | JAVA-003–JAVA-005          |                  5 |
| JavaScript |        6 | —                          |                  6 |
| PHP        |        3 | PHP-004–PHP-005            |                  5 |
| Python     |       10 | —                          |                 10 |
| Ruby       |        2 | RB-003–RB-005              |                  5 |
| SQL        |        3 | SQL-004–SQL-005            |                  5 |
| TypeScript |        6 | —                          |                  6 |
| **Total**  |   **46** | **23**                     |             **69** |

## New skills and difficulty

The audit's suggestions are a gap list rather than mandatory translations.
HTML adds four distinct native structures beyond its existing form-label task.
C++ gains interval merging and a stack problem; C# gains rectangular matrices
and string encoding; Ruby gains grouping, convolution and expression evaluation.
Java gains search, matrix indexing and modular string transformation. Graphs,
trees and additional form/date/grouping exercises remain useful later topics;
this expansion prioritizes complete, independently checkable tasks at the agreed
five-per-language target. The additions are 11 easy and 12 medium challenges.

| Key      | Difficulty | Problem / skill                          | Edges and negative coverage                                                                             |
| -------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| C-003    | Easy       | Longest equal run; state over arrays     | Empty, singleton, last run, resets; length-only and missed trailing run                                 |
| C-004    | Easy       | Stable filtering into an output buffer   | Empty/all/none removed, negatives, duplicates; inverted filter, reversal and impossible returned length |
| C-005    | Medium     | List GCD; number theory                  | Signs, zeros, empty, coprime; minimum-value and first-two-only mistakes                                 |
| CPP-003  | Medium     | Nested brackets; stack                   | Crossed types, unclosed/extra closers, ignored text; count-only and parentheses-only                    |
| CPP-004  | Easy       | Right rotation; modular indices          | Empty, zero/large k, duplicates; left rotation and set conversion                                       |
| CPP-005  | Medium     | Interval union; sorting                  | Unsorted/nested/duplicate/point/disjoint intervals; sort-only and merging gaps                          |
| CS-003   | Easy       | Increasing contiguous stretch            | Equal values, resets, final stretch; non-strict comparison and total length                             |
| CS-004   | Medium     | Rectangular transpose; matrix dimensions | Tall/wide/singleton, negatives; identity and reversed rows                                              |
| CS-005   | Medium     | Run-length encoding; strings             | Case, separated runs, count 1, multi-digit counts; global grouping and omitted singleton counts         |
| HTML-002 | Easy       | Table caption and row/column headers     | Scope, exact cells and order; missing scope and data cells replacing headers                            |
| HTML-003 | Easy       | Native disclosure markup                 | Expanded state, summary position, paragraph; collapsed and summary-last                                 |
| HTML-004 | Easy       | Figure, alt text, caption and dimensions | Exact attributes and caption order; missing alt and generic paragraph                                   |
| HTML-005 | Easy       | Ordered list and navigation links        | Start index, exact paths/order, same-tab links; unordered list and reversed destinations                |
| JAVA-003 | Medium     | Lower bound; search                      | Duplicates, absent target, ends, empty; upper bound and exact-match-only                                |
| JAVA-004 | Easy       | Square diagonals; indexing               | Odd/even dimensions, singleton, negatives; center double-counting and one diagonal                      |
| JAVA-005 | Easy       | Letter shifts; modular arithmetic        | Negative/large/zero offsets, both cases, punctuation; identity and lost nonletters                      |
| PHP-004  | Easy       | Stable parity partition                  | Negative odd/even, zero, duplicates; sorting and lost negative odds                                     |
| PHP-005  | Medium     | ISBN-10; format and checksum             | X position/case, length, invalid checksum; format-only and digit-only                                   |
| RB-003   | Medium     | Consecutive runs; enumerable grouping    | Empty, gaps, negatives; never splitting and singleton-only                                              |
| RB-004   | Medium     | Polynomial multiplication; convolution   | Cross terms, zeros, unequal sizes, negatives; zip and overwrite                                         |
| RB-005   | Medium     | Reverse Polish evaluation; operand stack | Subtraction order, negatives, zero, nested expressions; reversed operands and addition-only             |
| SQL-004  | Medium     | Top two distinct scores per group        | Ties at both levels, negative scores, singleton/empty; row_number and rank                              |
| SQL-005  | Medium     | Per-account running balances             | Sequence ties, unsorted input, negatives/zero/empty; missing partition and RANGE peers                  |

Every new challenge has a complete statement, visible examples, explicit bounds,
a single editable file/query, a useful failing starter, deterministic behavioral
cases, one independently valid alternative, and at least two plausible wrong variants
with their mistakes documented. Algorithms and style are unrestricted. HTML's
specified elements/attributes are intrinsic to its markup tasks. No new static
rules are needed, so rule-example checks are vacuous for these additions.

SQL schemas are standalone, with sample rows in the visible cases and task.
C/C++ adapters use `mm_json.h` and the actual `mm_call` contract; Java adapters
use the existing `Adapter.call(Json)` contract. Adapters are harness metadata,
not extra editable files. All solutions run in the shipped browser sandbox.

## Verification and handoff to ENG-338

Readiness depends on the passing receipts below, not the folder counts alone.
The exhaustive publish contract is: reference passes all cases twice with equal
outputs; starter fails at least one case; alternative passes every case; each
wrong variant fails at least one case; static publish/rule checks pass.

- [Exact new keys](eng-336-evidence/keys.txt).
- [New-challenge publish receipt](eng-336-evidence/publish.txt): actual language
  runtimes; additionally requires starters and wrong variants to reach case
  evaluation without compile/runtime errors.
- [Final C/HTML/PHP checks](eng-336-evidence/publish-final.txt): rerun after
  rejecting invalid C-004 return lengths, tightening HTML structural cases,
  clarifying examples and formatting PHP. These supersede their lines in the
  first receipt.
- [Repository tests](eng-336-evidence/unit-tests.txt):
  `flock /tmp/muscle-memory-heavy-check.lock npm test`.
- [Type checks](eng-336-evidence/typecheck.txt):
  `flock /tmp/muscle-memory-heavy-check.lock npm run typecheck`.
- [Exact revision manifest](eng-336-evidence/revisions.json): per-key hashes and
  case counts, tied to the final content build.

Repository tests initially exposed two baseline size assumptions (46 total and a
50-suggestion request expected to return every eligible challenge). With ENG-335
ownership coordination, the assertions now follow the catalog size and key set.
These are test-only changes; application behavior is unchanged.

The new-only receipt uses a temporary copy of the existing content-check harness
filtered to `keys.txt`, with additional phase/error checks for starters and wrong
variants. It does not change the shared validator or runtime. The unchanged baseline is covered separately by ENG-335; this branch exhaustively
checks its 23 additions without duplicating the audit's heavy baseline suite.
The [harness diff](eng-336-evidence/publish-harness.diff) records the exact key
filter and stronger checks; reproduction commands are in the evidence README. Runtime assets were staged from
the local main checkout and every file's SHA-256 and size was verified against
this base commit's runtime manifest. No engine or pin changed.

These are deterministic publish receipts, not a claim that every human can solve
every challenge. ENG-338 should independently play the new keys and evaluate
clarity/difficulty, and the coordinator must review the AI-authored content before
publication. HTML checks parse the DOM with linkedom in the browser sandbox;
they do not exercise rendered layout, image loading, keyboard interactions or a
screen reader. Existing-content corrections belong to ENG-335 and must be
composed with this branch by the coordinator. No merge or deployment is included.

## Integration regression: HTML-005 descendants

A list item may contain a link inside valid wrapper markup. Checks accept descendant anchors and verify each item’s own destination. A nested paragraph/span alternative passes; a wrong variant with both links in the first item fails. No direct-anchor-child restriction was added to the task.
