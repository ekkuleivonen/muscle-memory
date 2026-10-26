# ENG-338: exhaustive player-perspective audit

**Synthetic agent/browser automation, not a human study.** All 69 published challenges were attempted from visible statements, starters and public examples by six fresh context-free solvers. No private tests, reference solutions or previous fixes were supplied. First code is immutable; normal UI feedback alone was returned to solvers. PY-010 has a separately authored second candidate after its public helper/instructions were repaired.

## Result and scope

- Original production baseline: `214d40aaff96021bfcd7ef9b819c418b11c52a9c`. A fresh production read reconciles all 69 IDs and revisions with that baseline. The pre-release production snapshot is retained; reviewed candidate revisions differ for **CS-002, JS-006, PY-007, PY-010**.
- All 69 blind first candidates passed the original normal-UI checks;67 deliberate wrong candidates failed and2 exposed grading gaps. All 69 recovery/reload flows passed, and recorded code, revision and completion matched the UI.
- All 187 solver-authored public edges ran in the same pinned browser runners. Three additional contract probes brought baseline checks to190; two exposed PY-010's helper conflict. Post-fix focused probes supersede affected entries: **192/192 current-candidate public edges pass**.
- The four changed revisions passed normal local-UI correct/wrong/recovery/reload retests. Current candidate wrong variants are rejected for all 69. Baseline and post-repair receipts remain separate; original outcomes were not rewritten.
- All 69 IDs and all 112 baseline archive files are preserved byte-for-byte. New revisions are appended; no stats/schema/data reset.
- All 5 SQL schemas, fixture shapes/foreign keys and result semantics were checked, with 56 normal-UI cases and 14 public edges: [SQL review](eng-338/sql-review.md).
- [Confirmed fixes and triage](eng-338/findings.md), [machine-readable checklist](eng-338/checklist.json), [environment/runtime pins](eng-338/environment.json). Final pipeline/CI receipts are recorded in [validation](eng-338/validation.json).

## Method and limitations

Six partitions covered Python 10, JS/TS 12, SQL/HTML 10, C/C++ 10, Go/Ruby 12 and Java/C#/PHP 15. Playwright drove the normal editor and Submit controls in isolated stealth contexts, with all research uploads blocked (219 documented upload attempts intercepted during the original production UI run). 207 original UI submissions and 12 local post-repair submissions were recorded. Direct public-edge probes used the same opaque iframe/worker Runner and pinned runtimes; they are explicitly labelled separately from normal-UI testing. No host-language replacement or model-generated runtime feedback was used.

Every row below has real execution evidence. First-attempt scores are historical production scores, while candidate/wrong/edge columns refer to the reconciled candidate revision. Timing is automation/runtime time, not human solve time. Success demonstrates the tested cases, not every possible input, general coding competence, or effects of AI. Unsupported null/malformed/overflow hypotheticals were triaged against the written domain rather than silently expanding it. Concurrency and memo-performance rules retain their static-check limits. No paid model benchmarks, telemetry changes or unrelated backlog work occurred. Release was separately authorized after green checks; execution receipts are recorded on PR55 and ENG-338.

Independent static review examined all 69 solver notes and scoped repairs, found the additional JS-006 SKU-key collision, and cleared its structured-key repair/regression on rereview. The reviewer made no execution claims. Independent review and local pipeline checks are complete. Final-head CI and deployment receipts are recorded on [PR55](https://github.com/ekkuleivonen/muscle-memory/pull/55) and [ENG-338](https://linear.app/rowandreason/issue/ENG-338).

A controlled browser-only asset failure showed Retry checks rather than a failed-case verdict; invalid player syntax was separately identified as a compile error and corrected code recovered to completion: [feedback probe](eng-338/feedback-failure-categories.json). This was injected client-side QA, not an observed production outage.

## Exhaustive checklist

| ID | Candidate revision | Language | Original first | Candidate correct | Candidate wrong | Public edges | Evidence / disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C-001 | `35464d4a9a60` | c | 22/22 | 22/22 | rejected 21/22 | 5/5 | [UI](eng-338/receipts/C-001.json) · [edges](eng-338/edges/C-001.json) · unchanged |
| C-002 | `4899b029c3c8` | c | 16/16 | 16/16 | rejected 7/16 | 4/4 | [UI](eng-338/receipts/C-002.json) · [edges](eng-338/edges/C-002.json) · unchanged |
| C-003 | `fc49a2573a90` | c | 15/15 | 15/15 | rejected 11/15 | 4/4 | [UI](eng-338/receipts/C-003.json) · [edges](eng-338/edges/C-003.json) · unchanged |
| C-004 | `0935afcb9a89` | c | 31/31 | 31/31 | rejected 25/31 | 3/3 | [UI](eng-338/receipts/C-004.json) · [edges](eng-338/edges/C-004.json) · unchanged |
| C-005 | `cde78a35b254` | c | 19/19 | 19/19 | rejected 13/19 | 5/5 | [UI](eng-338/receipts/C-005.json) · [edges](eng-338/edges/C-005.json) · unchanged |
| CPP-001 | `63cd99a0b96a` | cpp | 15/15 | 15/15 | rejected 10/15 | 3/3 | [UI](eng-338/receipts/CPP-001.json) · [edges](eng-338/edges/CPP-001.json) · unchanged |
| CPP-002 | `b60f7273efa7` | cpp | 18/18 | 18/18 | rejected 10/18 | 3/3 | [UI](eng-338/receipts/CPP-002.json) · [edges](eng-338/edges/CPP-002.json) · unchanged |
| CPP-003 | `93bfa0b61e35` | cpp | 9/9 | 9/9 | rejected 8/9 | 5/5 | [UI](eng-338/receipts/CPP-003.json) · [edges](eng-338/edges/CPP-003.json) · unchanged |
| CPP-004 | `7d583fad9b86` | cpp | 31/31 | 31/31 | rejected 26/31 | 4/4 | [UI](eng-338/receipts/CPP-004.json) · [edges](eng-338/edges/CPP-004.json) · unchanged |
| CPP-005 | `66e7aed0a6be` | cpp | 7/7 | 7/7 | rejected 6/7 | 4/4 | [UI](eng-338/receipts/CPP-005.json) · [edges](eng-338/edges/CPP-005.json) · unchanged |
| CS-001 | `1eb2bc05c432` | csharp | 21/21 | 21/21 | rejected 13/21 | 3/3 | [UI](eng-338/receipts/CS-001.json) · [edges](eng-338/edges/CS-001.json) · unchanged |
| CS-002 | `9b878939135d` | csharp | 23/23 | 23/23 | rejected 15/23 | 3/3 | [UI](eng-338/retests/pass1/CS-002.json) · [edges](eng-338/edges-final/CS-002.json) · changed; [fixes](eng-338/findings.md) |
| CS-003 | `528bb5a08300` | csharp | 15/15 | 15/15 | rejected 10/15 | 3/3 | [UI](eng-338/receipts/CS-003.json) · [edges](eng-338/edges/CS-003.json) · unchanged |
| CS-004 | `6c14f033784c` | csharp | 6/6 | 6/6 | rejected 2/6 | 3/3 | [UI](eng-338/receipts/CS-004.json) · [edges](eng-338/edges/CS-004.json) · unchanged |
| CS-005 | `9050e23ee264` | csharp | 11/11 | 11/11 | rejected 6/11 | 3/3 | [UI](eng-338/receipts/CS-005.json) · [edges](eng-338/edges/CS-005.json) · unchanged |
| GO-001 | `d73f7e05a154` | go | 21/21 | 21/21 | rejected 14/21 | 2/2 | [UI](eng-338/receipts/GO-001.json) · [edges](eng-338/edges/GO-001.json) · unchanged |
| GO-002 | `3c10fd7c2fe8` | go | 18/18 | 18/18 | rejected 16/18 | 2/2 | [UI](eng-338/receipts/GO-002.json) · [edges](eng-338/edges/GO-002.json) · unchanged |
| GO-003 | `23419d0a4b0b` | go | 15/15 | 15/15 | rejected 2/15 | 2/2 | [UI](eng-338/receipts/GO-003.json) · [edges](eng-338/edges/GO-003.json) · unchanged |
| GO-004 | `bd709be6d357` | go | 24/24 | 24/24 | rejected 23/24 | 3/3 | [UI](eng-338/receipts/GO-004.json) · [edges](eng-338/edges/GO-004.json) · unchanged |
| GO-005 | `6284f2295fb1` | go | 20/20 | 20/20 | rejected 19/20 | 3/3 | [UI](eng-338/receipts/GO-005.json) · [edges](eng-338/edges/GO-005.json) · unchanged |
| GO-006 | `2279a86fff5b` | go | 19/19 | 19/19 | rejected 12/19 | 2/2 | [UI](eng-338/receipts/GO-006.json) · [edges](eng-338/edges/GO-006.json) · unchanged |
| GO-007 | `e566002e3c3b` | go | 16/16 | 16/16 | rejected 7/16 | 3/3 | [UI](eng-338/receipts/GO-007.json) · [edges](eng-338/edges/GO-007.json) · unchanged |
| HTML-001 | `e6472fd87067` | html | 16/16 | 16/16 | rejected 11/16 | 2/2 | [UI](eng-338/receipts/HTML-001.json) · [edges](eng-338/edges/HTML-001.json) · unchanged |
| HTML-002 | `5083edcff006` | html | 16/16 | 16/16 | rejected 15/16 | 2/2 | [UI](eng-338/receipts/HTML-002.json) · [edges](eng-338/edges/HTML-002.json) · unchanged |
| HTML-003 | `c552d26e0876` | html | 10/10 | 10/10 | rejected 9/10 | 2/2 | [UI](eng-338/receipts/HTML-003.json) · [edges](eng-338/edges/HTML-003.json) · unchanged |
| HTML-004 | `06166dcb2efb` | html | 10/10 | 10/10 | rejected 9/10 | 2/2 | [UI](eng-338/receipts/HTML-004.json) · [edges](eng-338/edges/HTML-004.json) · unchanged |
| HTML-005 | `cd5926aef237` | html | 12/12 | 12/12 | rejected 11/12 | 2/2 | [UI](eng-338/receipts/HTML-005.json) · [edges](eng-338/edges/HTML-005.json) · unchanged |
| JAVA-001 | `e9b1f62267ac` | java | 21/21 | 21/21 | rejected 16/21 | 3/3 | [UI](eng-338/receipts/JAVA-001.json) · [edges](eng-338/edges/JAVA-001.json) · unchanged |
| JAVA-002 | `e66f30751757` | java | 22/22 | 22/22 | rejected 21/22 | 3/3 | [UI](eng-338/receipts/JAVA-002.json) · [edges](eng-338/edges/JAVA-002.json) · unchanged |
| JAVA-003 | `faa01f0f122e` | java | 32/32 | 32/32 | rejected 24/32 | 4/4 | [UI](eng-338/receipts/JAVA-003.json) · [edges](eng-338/edges/JAVA-003.json) · unchanged |
| JAVA-004 | `ec7de97a2f10` | java | 5/5 | 5/5 | rejected 2/5 | 3/3 | [UI](eng-338/receipts/JAVA-004.json) · [edges](eng-338/edges/JAVA-004.json) · unchanged |
| JAVA-005 | `3ce284ce8195` | java | 19/19 | 19/19 | rejected 15/19 | 3/3 | [UI](eng-338/receipts/JAVA-005.json) · [edges](eng-338/edges/JAVA-005.json) · unchanged |
| JS-001 | `4e3890b9a4fc` | javascript | 10/10 | 10/10 | rejected 8/10 | 2/2 | [UI](eng-338/receipts/JS-001.json) · [edges](eng-338/edges/JS-001.json) · unchanged |
| JS-002 | `2c358ce3b845` | javascript | 21/21 | 21/21 | rejected 13/21 | 2/2 | [UI](eng-338/receipts/JS-002.json) · [edges](eng-338/edges/JS-002.json) · unchanged |
| JS-003 | `59980dd4271a` | javascript | 18/18 | 18/18 | rejected 13/18 | 2/2 | [UI](eng-338/receipts/JS-003.json) · [edges](eng-338/edges/JS-003.json) · unchanged |
| JS-004 | `0f48fac293b5` | javascript | 16/16 | 16/16 | rejected 12/16 | 2/2 | [UI](eng-338/receipts/JS-004.json) · [edges](eng-338/edges/JS-004.json) · unchanged |
| JS-005 | `6320a78f5159` | javascript | 17/17 | 17/17 | rejected 3/17 | 2/2 | [UI](eng-338/receipts/JS-005.json) · [edges](eng-338/edges/JS-005.json) · unchanged |
| JS-006 | `4e1161b197cf` | javascript | 16/16 | 18/18 | rejected 17/18 | 3/3 | [UI](eng-338/retests/pass1/JS-006.json) · [edges](eng-338/edges-final/JS-006.json) · changed; [fixes](eng-338/findings.md) |
| PHP-001 | `883834c79dad` | php | 21/21 | 21/21 | rejected 13/21 | 3/3 | [UI](eng-338/receipts/PHP-001.json) · [edges](eng-338/edges/PHP-001.json) · unchanged |
| PHP-002 | `07b2c479fd24` | php | 16/16 | 16/16 | rejected 9/16 | 4/4 | [UI](eng-338/receipts/PHP-002.json) · [edges](eng-338/edges/PHP-002.json) · unchanged |
| PHP-003 | `835747406459` | php | 18/18 | 18/18 | rejected 17/18 | 4/4 | [UI](eng-338/receipts/PHP-003.json) · [edges](eng-338/edges/PHP-003.json) · unchanged |
| PHP-004 | `3b183d6cb847` | php | 14/14 | 14/14 | rejected 7/14 | 3/3 | [UI](eng-338/receipts/PHP-004.json) · [edges](eng-338/edges/PHP-004.json) · unchanged |
| PHP-005 | `2d5c560a396e` | php | 10/10 | 10/10 | rejected 9/10 | 5/5 | [UI](eng-338/receipts/PHP-005.json) · [edges](eng-338/edges/PHP-005.json) · unchanged |
| PY-001 | `1478c6f5aea2` | python | 21/21 | 21/21 | rejected 13/21 | 2/2 | [UI](eng-338/receipts/PY-001.json) · [edges](eng-338/edges/PY-001.json) · unchanged |
| PY-002 | `0bca3c710baa` | python | 15/15 | 15/15 | rejected 11/15 | 1/1 | [UI](eng-338/receipts/PY-002.json) · [edges](eng-338/edges/PY-002.json) · unchanged |
| PY-003 | `f6cad67e20e3` | python | 17/17 | 17/17 | rejected 2/17 | 2/2 | [UI](eng-338/receipts/PY-003.json) · [edges](eng-338/edges/PY-003.json) · unchanged |
| PY-004 | `9ee05a3f865d` | python | 18/18 | 18/18 | rejected 17/18 | 2/2 | [UI](eng-338/receipts/PY-004.json) · [edges](eng-338/edges/PY-004.json) · unchanged |
| PY-005 | `3b8d9edb5d37` | python | 17/17 | 17/17 | rejected 16/17 | 2/2 | [UI](eng-338/receipts/PY-005.json) · [edges](eng-338/edges/PY-005.json) · unchanged |
| PY-006 | `4f006c4a24df` | python | 17/17 | 17/17 | rejected 13/17 | 1/1 | [UI](eng-338/receipts/PY-006.json) · [edges](eng-338/edges/PY-006.json) · unchanged |
| PY-007 | `8be1ec712ed8` | python | 15/15 | 17/17 | rejected 15/17 | 2/2 | [UI](eng-338/retests/pass1/PY-007.json) · [edges](eng-338/edges-final/PY-007.json) · changed; [fixes](eng-338/findings.md) |
| PY-008 | `27a612b805df` | python | 16/16 | 16/16 | rejected 11/16 | 1/1 | [UI](eng-338/receipts/PY-008.json) · [edges](eng-338/edges/PY-008.json) · unchanged |
| PY-009 | `697c865602b3` | python | 17/17 | 17/17 | rejected 11/17 | 2/2 | [UI](eng-338/receipts/PY-009.json) · [edges](eng-338/edges/PY-009.json) · unchanged |
| PY-010 | `fa5027f52536` | python | 16/16 | 19/19 | rejected 9/19 | 5/5 | [UI](eng-338/retests/pass1/PY-010.json) · [edges](eng-338/edges-final/PY-010.json) · changed; [fixes](eng-338/findings.md) |
| RB-001 | `841e463333b9` | ruby | 21/21 | 21/21 | rejected 18/21 | 2/2 | [UI](eng-338/receipts/RB-001.json) · [edges](eng-338/edges/RB-001.json) · unchanged |
| RB-002 | `16a31aca47c2` | ruby | 24/24 | 24/24 | rejected 16/24 | 3/3 | [UI](eng-338/receipts/RB-002.json) · [edges](eng-338/edges/RB-002.json) · unchanged |
| RB-003 | `d62765131db8` | ruby | 6/6 | 6/6 | rejected 3/6 | 2/2 | [UI](eng-338/receipts/RB-003.json) · [edges](eng-338/edges/RB-003.json) · unchanged |
| RB-004 | `7b75bd74a6c5` | ruby | 6/6 | 6/6 | rejected 4/6 | 2/2 | [UI](eng-338/receipts/RB-004.json) · [edges](eng-338/edges/RB-004.json) · unchanged |
| RB-005 | `24ea37d6e545` | ruby | 7/7 | 7/7 | rejected 4/7 | 3/3 | [UI](eng-338/receipts/RB-005.json) · [edges](eng-338/edges/RB-005.json) · unchanged |
| SQL-001 | `c7146b957f34` | sql | 15/15 | 15/15 | rejected 13/15 | 3/3 | [UI](eng-338/receipts/SQL-001.json) · [edges](eng-338/edges/SQL-001.json) · unchanged |
| SQL-002 | `8069f186eae8` | sql | 16/16 | 16/16 | rejected 10/16 | 3/3 | [UI](eng-338/receipts/SQL-002.json) · [edges](eng-338/edges/SQL-002.json) · unchanged |
| SQL-003 | `4cb69977e6d6` | sql | 15/15 | 15/15 | rejected 14/15 | 3/3 | [UI](eng-338/receipts/SQL-003.json) · [edges](eng-338/edges/SQL-003.json) · unchanged |
| SQL-004 | `2a1c63fa67d1` | sql | 5/5 | 5/5 | rejected 4/5 | 3/3 | [UI](eng-338/receipts/SQL-004.json) · [edges](eng-338/edges/SQL-004.json) · unchanged |
| SQL-005 | `50aa91bff2fe` | sql | 5/5 | 5/5 | rejected 3/5 | 2/2 | [UI](eng-338/receipts/SQL-005.json) · [edges](eng-338/edges/SQL-005.json) · unchanged |
| TS-001 | `87f3834b8d08` | typescript | 21/21 | 21/21 | rejected 13/21 | 2/2 | [UI](eng-338/receipts/TS-001.json) · [edges](eng-338/edges/TS-001.json) · unchanged |
| TS-002 | `a035e776c48a` | typescript | 19/19 | 19/19 | rejected 16/19 | 3/3 | [UI](eng-338/receipts/TS-002.json) · [edges](eng-338/edges/TS-002.json) · unchanged |
| TS-003 | `49b3238dff45` | typescript | 18/18 | 18/18 | rejected 17/18 | 2/2 | [UI](eng-338/receipts/TS-003.json) · [edges](eng-338/edges/TS-003.json) · unchanged |
| TS-004 | `0a4a87c203c1` | typescript | 18/18 | 18/18 | rejected 17/18 | 3/3 | [UI](eng-338/receipts/TS-004.json) · [edges](eng-338/edges/TS-004.json) · unchanged |
| TS-005 | `f718959a5bcb` | typescript | 16/16 | 16/16 | rejected 12/16 | 2/2 | [UI](eng-338/receipts/TS-005.json) · [edges](eng-338/edges/TS-005.json) · unchanged |
| TS-006 | `1939c20f182b` | typescript | 17/17 | 17/17 | rejected 16/17 | 4/4 | [UI](eng-338/receipts/TS-006.json) · [edges](eng-338/edges/TS-006.json) · unchanged |
