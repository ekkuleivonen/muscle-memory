# ENG-338: player-perspective challenge audit

Baseline: `214d40aaff96021bfcd7ef9b819c418b11c52a9c`. Entries remain unrun until actual receipts exist; UI verification is distinct from the still-pending independent edge/wording audit. This is synthetic agent QA, not human research.

## Method

Six fresh solver partitions receive only the visible task, starter and public examples. They cannot read the repository, private cases, references, alternatives or previous fixes. Initial candidates are saved before feedback. A single upload-blocked browser harness submits their code through the normal UI under the shared heavy-check lock. Solvers receive only rendered feedback for revision; no hidden answers or coaching. Each entry records initial code hash/feedback, final success, an independently authored wrong variant and public-derived edge behavior. Runtime failures remain distinct from incorrect code.

Content fixes, if needed, create new immutable revisions; all IDs and existing archives stay intact. No merge/deploy approval is included in this issue.

## Partitions

- a-python: 10 challenges (python).
- b-js-ts: 12 challenges (javascript, typescript).
- c-sql-html: 10 challenges (html, sql).
- d-c-cpp: 10 challenges (c, cpp).
- e-go-ruby: 12 challenges (go, ruby).
- f-java-csharp-php: 15 challenges (csharp, java, php).

## Exhaustive checklist

Statuses below distinguish completed UI candidate checks from the still-pending independent edge/wording audit. No unrun challenge is passed.

| ID | Revision | Language/runtime | First | Final | Wrong/edge | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-001 | `35464d4a9a60` | c / Clang/YoWASP | passed 22/22 | 22/22 | failed 21/22; edge pending | [receipt](eng-338/receipts/C-001.json) |
| C-002 | `4899b029c3c8` | c / Clang/YoWASP | passed 16/16 | 16/16 | failed 7/16; edge pending | [receipt](eng-338/receipts/C-002.json) |
| C-003 | `fc49a2573a90` | c / Clang/YoWASP | passed 15/15 | 15/15 | failed 11/15; edge pending | [receipt](eng-338/receipts/C-003.json) |
| C-004 | `0935afcb9a89` | c / Clang/YoWASP | passed 31/31 | 31/31 | failed 25/31; edge pending | [receipt](eng-338/receipts/C-004.json) |
| C-005 | `cde78a35b254` | c / Clang/YoWASP | passed 19/19 | 19/19 | failed 13/19; edge pending | [receipt](eng-338/receipts/C-005.json) |
| CPP-001 | `63cd99a0b96a` | cpp / Clang/YoWASP | passed 15/15 | 15/15 | failed 10/15; edge pending | [receipt](eng-338/receipts/CPP-001.json) |
| CPP-002 | `b60f7273efa7` | cpp / Clang/YoWASP | passed 18/18 | 18/18 | failed 10/18; edge pending | [receipt](eng-338/receipts/CPP-002.json) |
| CPP-003 | `93bfa0b61e35` | cpp / Clang/YoWASP | passed 9/9 | 9/9 | failed 8/9; edge pending | [receipt](eng-338/receipts/CPP-003.json) |
| CPP-004 | `7d583fad9b86` | cpp / Clang/YoWASP | passed 31/31 | 31/31 | failed 26/31; edge pending | [receipt](eng-338/receipts/CPP-004.json) |
| CPP-005 | `66e7aed0a6be` | cpp / Clang/YoWASP | passed 7/7 | 7/7 | failed 6/7; edge pending | [receipt](eng-338/receipts/CPP-005.json) |
| CS-001 | `1eb2bc05c432` | csharp / Roslyn/.NET WASM | passed 21/21 | 21/21 | failed 13/21; edge pending | [receipt](eng-338/receipts/CS-001.json) |
| CS-002 | `790005e37bae` | csharp / Roslyn/.NET WASM | passed 23/23 | 23/23 | failed 15/23; edge pending | [receipt](eng-338/receipts/CS-002.json) |
| CS-003 | `528bb5a08300` | csharp / Roslyn/.NET WASM | passed 15/15 | 15/15 | failed 10/15; edge pending | [receipt](eng-338/receipts/CS-003.json) |
| CS-004 | `6c14f033784c` | csharp / Roslyn/.NET WASM | passed 6/6 | 6/6 | failed 2/6; edge pending | [receipt](eng-338/receipts/CS-004.json) |
| CS-005 | `9050e23ee264` | csharp / Roslyn/.NET WASM | passed 11/11 | 11/11 | failed 6/11; edge pending | [receipt](eng-338/receipts/CS-005.json) |
| GO-001 | `d73f7e05a154` | go / Yaegi WASM | passed 21/21 | 21/21 | failed 14/21; edge pending | [receipt](eng-338/receipts/GO-001.json) |
| GO-002 | `3c10fd7c2fe8` | go / Yaegi WASM | passed 18/18 | 18/18 | failed 16/18; edge pending | [receipt](eng-338/receipts/GO-002.json) |
| GO-003 | `23419d0a4b0b` | go / Yaegi WASM | passed 15/15 | 15/15 | failed 2/15; edge pending | [receipt](eng-338/receipts/GO-003.json) |
| GO-004 | `bd709be6d357` | go / Yaegi WASM | passed 24/24 | 24/24 | failed 23/24; edge pending | [receipt](eng-338/receipts/GO-004.json) |
| GO-005 | `6284f2295fb1` | go / Yaegi WASM | passed 20/20 | 20/20 | failed 19/20; edge pending | [receipt](eng-338/receipts/GO-005.json) |
| GO-006 | `2279a86fff5b` | go / Yaegi WASM | passed 19/19 | 19/19 | failed 12/19; edge pending | [receipt](eng-338/receipts/GO-006.json) |
| GO-007 | `e566002e3c3b` | go / Yaegi WASM | passed 16/16 | 16/16 | failed 7/16; edge pending | [receipt](eng-338/receipts/GO-007.json) |
| HTML-001 | `e6472fd87067` | html / linkedom DOM | passed 16/16 | 16/16 | failed 11/16; edge pending | [receipt](eng-338/receipts/HTML-001.json) |
| HTML-002 | `5083edcff006` | html / linkedom DOM | passed 16/16 | 16/16 | failed 15/16; edge pending | [receipt](eng-338/receipts/HTML-002.json) |
| HTML-003 | `c552d26e0876` | html / linkedom DOM | passed 10/10 | 10/10 | failed 9/10; edge pending | [receipt](eng-338/receipts/HTML-003.json) |
| HTML-004 | `06166dcb2efb` | html / linkedom DOM | passed 10/10 | 10/10 | failed 9/10; edge pending | [receipt](eng-338/receipts/HTML-004.json) |
| HTML-005 | `cd5926aef237` | html / linkedom DOM | passed 12/12 | 12/12 | failed 11/12; edge pending | [receipt](eng-338/receipts/HTML-005.json) |
| JAVA-001 | `e9b1f62267ac` | java / teavm-javac | passed 21/21 | 21/21 | failed 16/21; edge pending | [receipt](eng-338/receipts/JAVA-001.json) |
| JAVA-002 | `e66f30751757` | java / teavm-javac | passed 22/22 | 22/22 | failed 21/22; edge pending | [receipt](eng-338/receipts/JAVA-002.json) |
| JAVA-003 | `faa01f0f122e` | java / teavm-javac | passed 32/32 | 32/32 | failed 24/32; edge pending | [receipt](eng-338/receipts/JAVA-003.json) |
| JAVA-004 | `ec7de97a2f10` | java / teavm-javac | passed 5/5 | 5/5 | failed 2/5; edge pending | [receipt](eng-338/receipts/JAVA-004.json) |
| JAVA-005 | `3ce284ce8195` | java / teavm-javac | passed 19/19 | 19/19 | failed 15/19; edge pending | [receipt](eng-338/receipts/JAVA-005.json) |
| JS-001 | `4e3890b9a4fc` | javascript / browser JavaScript | passed 10/10 | 10/10 | failed 8/10; edge pending | [receipt](eng-338/receipts/JS-001.json) |
| JS-002 | `2c358ce3b845` | javascript / browser JavaScript | passed 21/21 | 21/21 | failed 13/21; edge pending | [receipt](eng-338/receipts/JS-002.json) |
| JS-003 | `59980dd4271a` | javascript / browser JavaScript | passed 18/18 | 18/18 | failed 13/18; edge pending | [receipt](eng-338/receipts/JS-003.json) |
| JS-004 | `0f48fac293b5` | javascript / browser JavaScript | passed 16/16 | 16/16 | failed 12/16; edge pending | [receipt](eng-338/receipts/JS-004.json) |
| JS-005 | `6320a78f5159` | javascript / browser JavaScript | passed 17/17 | 17/17 | failed 3/17; edge pending | [receipt](eng-338/receipts/JS-005.json) |
| JS-006 | `8082598a59e1` | javascript / browser JavaScript | passed 16/16 | 16/16 | passed 16/16; edge pending | [receipt](eng-338/receipts/JS-006.json) |
| PHP-001 | `883834c79dad` | php / php-wasm | passed 21/21 | 21/21 | failed 13/21; edge pending | [receipt](eng-338/receipts/PHP-001.json) |
| PHP-002 | `07b2c479fd24` | php / php-wasm | passed 16/16 | 16/16 | failed 9/16; edge pending | [receipt](eng-338/receipts/PHP-002.json) |
| PHP-003 | `835747406459` | php / php-wasm | passed 18/18 | 18/18 | failed 17/18; edge pending | [receipt](eng-338/receipts/PHP-003.json) |
| PHP-004 | `3b183d6cb847` | php / php-wasm | passed 14/14 | 14/14 | failed 7/14; edge pending | [receipt](eng-338/receipts/PHP-004.json) |
| PHP-005 | `2d5c560a396e` | php / php-wasm | passed 10/10 | 10/10 | failed 9/10; edge pending | [receipt](eng-338/receipts/PHP-005.json) |
| PY-001 | `1478c6f5aea2` | python / Pyodide/CPython3.14 | passed 21/21 | 21/21 | failed 13/21; edge pending | [receipt](eng-338/receipts/PY-001.json) |
| PY-002 | `0bca3c710baa` | python / Pyodide/CPython3.14 | passed 15/15 | 15/15 | failed 11/15; edge pending | [receipt](eng-338/receipts/PY-002.json) |
| PY-003 | `f6cad67e20e3` | python / Pyodide/CPython3.14 | passed 17/17 | 17/17 | failed 2/17; edge pending | [receipt](eng-338/receipts/PY-003.json) |
| PY-004 | `9ee05a3f865d` | python / Pyodide/CPython3.14 | passed 18/18 | 18/18 | failed 17/18; edge pending | [receipt](eng-338/receipts/PY-004.json) |
| PY-005 | `3b8d9edb5d37` | python / Pyodide/CPython3.14 | passed 17/17 | 17/17 | failed 16/17; edge pending | [receipt](eng-338/receipts/PY-005.json) |
| PY-006 | `4f006c4a24df` | python / Pyodide/CPython3.14 | passed 17/17 | 17/17 | failed 13/17; edge pending | [receipt](eng-338/receipts/PY-006.json) |
| PY-007 | `e8a8cfef1e39` | python / Pyodide/CPython3.14 | passed 15/15 | 15/15 | passed 15/15; edge pending | [receipt](eng-338/receipts/PY-007.json) |
| PY-008 | `27a612b805df` | python / Pyodide/CPython3.14 | passed 16/16 | 16/16 | failed 11/16; edge pending | [receipt](eng-338/receipts/PY-008.json) |
| PY-009 | `697c865602b3` | python / Pyodide/CPython3.14 | passed 17/17 | 17/17 | failed 11/17; edge pending | [receipt](eng-338/receipts/PY-009.json) |
| PY-010 | `8969155c54b3` | python / Pyodide/CPython3.14 | passed 16/16 | 16/16 | failed 8/16; edge pending | [receipt](eng-338/receipts/PY-010.json) |
| RB-001 | `841e463333b9` | ruby / ruby.wasm | unrun | pending | unrun |  |
| RB-002 | `16a31aca47c2` | ruby / ruby.wasm | unrun | pending | unrun |  |
| RB-003 | `d62765131db8` | ruby / ruby.wasm | unrun | pending | unrun |  |
| RB-004 | `7b75bd74a6c5` | ruby / ruby.wasm | unrun | pending | unrun |  |
| RB-005 | `24ea37d6e545` | ruby / ruby.wasm | unrun | pending | unrun |  |
| SQL-001 | `c7146b957f34` | sql / PGlite/PostgreSQL | passed 15/15 | 15/15 | failed 13/15; edge pending | [receipt](eng-338/receipts/SQL-001.json) |
| SQL-002 | `8069f186eae8` | sql / PGlite/PostgreSQL | unrun | pending | unrun |  |
| SQL-003 | `4cb69977e6d6` | sql / PGlite/PostgreSQL | unrun | pending | unrun |  |
| SQL-004 | `2a1c63fa67d1` | sql / PGlite/PostgreSQL | unrun | pending | unrun |  |
| SQL-005 | `50aa91bff2fe` | sql / PGlite/PostgreSQL | unrun | pending | unrun |  |
| TS-001 | `87f3834b8d08` | typescript / Sucrase/browser JavaScript | unrun | pending | unrun |  |
| TS-002 | `a035e776c48a` | typescript / Sucrase/browser JavaScript | unrun | pending | unrun |  |
| TS-003 | `49b3238dff45` | typescript / Sucrase/browser JavaScript | unrun | pending | unrun |  |
| TS-004 | `0a4a87c203c1` | typescript / Sucrase/browser JavaScript | unrun | pending | unrun |  |
| TS-005 | `f718959a5bcb` | typescript / Sucrase/browser JavaScript | unrun | pending | unrun |  |
| TS-006 | `1939c20f182b` | typescript / Sucrase/browser JavaScript | unrun | pending | unrun |  |
