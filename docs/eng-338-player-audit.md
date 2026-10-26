# ENG-338: player-perspective challenge audit

Baseline: `214d40aaff96021bfcd7ef9b819c418b11c52a9c`. All entries below are **unrun** until actual receipts exist. This is synthetic agent QA, not human research.

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

| ID | Revision | Language/runtime | First | Final | Wrong/edge | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-001 | `35464d4a9a60` | c / Clang/YoWASP | unrun | unrun | unrun | |
| C-002 | `4899b029c3c8` | c / Clang/YoWASP | unrun | unrun | unrun | |
| C-003 | `fc49a2573a90` | c / Clang/YoWASP | unrun | unrun | unrun | |
| C-004 | `0935afcb9a89` | c / Clang/YoWASP | unrun | unrun | unrun | |
| C-005 | `cde78a35b254` | c / Clang/YoWASP | unrun | unrun | unrun | |
| CPP-001 | `63cd99a0b96a` | cpp / Clang/YoWASP | unrun | unrun | unrun | |
| CPP-002 | `b60f7273efa7` | cpp / Clang/YoWASP | unrun | unrun | unrun | |
| CPP-003 | `93bfa0b61e35` | cpp / Clang/YoWASP | unrun | unrun | unrun | |
| CPP-004 | `7d583fad9b86` | cpp / Clang/YoWASP | unrun | unrun | unrun | |
| CPP-005 | `66e7aed0a6be` | cpp / Clang/YoWASP | unrun | unrun | unrun | |
| CS-001 | `1eb2bc05c432` | csharp / Roslyn/.NET WASM | unrun | unrun | unrun | |
| CS-002 | `790005e37bae` | csharp / Roslyn/.NET WASM | unrun | unrun | unrun | |
| CS-003 | `528bb5a08300` | csharp / Roslyn/.NET WASM | unrun | unrun | unrun | |
| CS-004 | `6c14f033784c` | csharp / Roslyn/.NET WASM | unrun | unrun | unrun | |
| CS-005 | `9050e23ee264` | csharp / Roslyn/.NET WASM | unrun | unrun | unrun | |
| GO-001 | `d73f7e05a154` | go / Yaegi WASM | unrun | unrun | unrun | |
| GO-002 | `3c10fd7c2fe8` | go / Yaegi WASM | unrun | unrun | unrun | |
| GO-003 | `23419d0a4b0b` | go / Yaegi WASM | unrun | unrun | unrun | |
| GO-004 | `bd709be6d357` | go / Yaegi WASM | unrun | unrun | unrun | |
| GO-005 | `6284f2295fb1` | go / Yaegi WASM | unrun | unrun | unrun | |
| GO-006 | `2279a86fff5b` | go / Yaegi WASM | unrun | unrun | unrun | |
| GO-007 | `e566002e3c3b` | go / Yaegi WASM | unrun | unrun | unrun | |
| HTML-001 | `e6472fd87067` | html / linkedom DOM | unrun | unrun | unrun | |
| HTML-002 | `5083edcff006` | html / linkedom DOM | unrun | unrun | unrun | |
| HTML-003 | `c552d26e0876` | html / linkedom DOM | unrun | unrun | unrun | |
| HTML-004 | `06166dcb2efb` | html / linkedom DOM | unrun | unrun | unrun | |
| HTML-005 | `cd5926aef237` | html / linkedom DOM | unrun | unrun | unrun | |
| JAVA-001 | `e9b1f62267ac` | java / teavm-javac | unrun | unrun | unrun | |
| JAVA-002 | `e66f30751757` | java / teavm-javac | unrun | unrun | unrun | |
| JAVA-003 | `faa01f0f122e` | java / teavm-javac | unrun | unrun | unrun | |
| JAVA-004 | `ec7de97a2f10` | java / teavm-javac | unrun | unrun | unrun | |
| JAVA-005 | `3ce284ce8195` | java / teavm-javac | unrun | unrun | unrun | |
| JS-001 | `4e3890b9a4fc` | javascript / browser JavaScript | unrun | unrun | unrun | |
| JS-002 | `2c358ce3b845` | javascript / browser JavaScript | unrun | unrun | unrun | |
| JS-003 | `59980dd4271a` | javascript / browser JavaScript | unrun | unrun | unrun | |
| JS-004 | `0f48fac293b5` | javascript / browser JavaScript | unrun | unrun | unrun | |
| JS-005 | `6320a78f5159` | javascript / browser JavaScript | unrun | unrun | unrun | |
| JS-006 | `8082598a59e1` | javascript / browser JavaScript | unrun | unrun | unrun | |
| PHP-001 | `883834c79dad` | php / php-wasm | unrun | unrun | unrun | |
| PHP-002 | `07b2c479fd24` | php / php-wasm | unrun | unrun | unrun | |
| PHP-003 | `835747406459` | php / php-wasm | unrun | unrun | unrun | |
| PHP-004 | `3b183d6cb847` | php / php-wasm | unrun | unrun | unrun | |
| PHP-005 | `2d5c560a396e` | php / php-wasm | unrun | unrun | unrun | |
| PY-001 | `1478c6f5aea2` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-002 | `0bca3c710baa` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-003 | `f6cad67e20e3` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-004 | `9ee05a3f865d` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-005 | `3b8d9edb5d37` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-006 | `4f006c4a24df` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-007 | `e8a8cfef1e39` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-008 | `27a612b805df` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-009 | `697c865602b3` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| PY-010 | `8969155c54b3` | python / Pyodide/CPython3.14 | unrun | unrun | unrun | |
| RB-001 | `841e463333b9` | ruby / ruby.wasm | unrun | unrun | unrun | |
| RB-002 | `16a31aca47c2` | ruby / ruby.wasm | unrun | unrun | unrun | |
| RB-003 | `d62765131db8` | ruby / ruby.wasm | unrun | unrun | unrun | |
| RB-004 | `7b75bd74a6c5` | ruby / ruby.wasm | unrun | unrun | unrun | |
| RB-005 | `24ea37d6e545` | ruby / ruby.wasm | unrun | unrun | unrun | |
| SQL-001 | `c7146b957f34` | sql / PGlite/PostgreSQL | unrun | unrun | unrun | |
| SQL-002 | `8069f186eae8` | sql / PGlite/PostgreSQL | unrun | unrun | unrun | |
| SQL-003 | `4cb69977e6d6` | sql / PGlite/PostgreSQL | unrun | unrun | unrun | |
| SQL-004 | `2a1c63fa67d1` | sql / PGlite/PostgreSQL | unrun | unrun | unrun | |
| SQL-005 | `50aa91bff2fe` | sql / PGlite/PostgreSQL | unrun | unrun | unrun | |
| TS-001 | `87f3834b8d08` | typescript / Sucrase/browser JavaScript | unrun | unrun | unrun | |
| TS-002 | `a035e776c48a` | typescript / Sucrase/browser JavaScript | unrun | unrun | unrun | |
| TS-003 | `49b3238dff45` | typescript / Sucrase/browser JavaScript | unrun | unrun | unrun | |
| TS-004 | `0a4a87c203c1` | typescript / Sucrase/browser JavaScript | unrun | unrun | unrun | |
| TS-005 | `f718959a5bcb` | typescript / Sucrase/browser JavaScript | unrun | unrun | unrun | |
| TS-006 | `1939c20f182b` | typescript / Sucrase/browser JavaScript | unrun | unrun | unrun | |
