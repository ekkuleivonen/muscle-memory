# ENG-338 findings and disposition

This is synthetic agent QA, not human research. Original visible packets, first code and normal-UI receipts remain immutable.

## Confirmed defects — repaired and retested

- **CS-002 units:** visible starter XML says cents; task/examples/results use dollars. Blind first passed23/23, wrong midpoint rounding failed15/23, recovery passed23/23. Starter comment corrected to dollars; new revision archived.
- **JS-006 discount identity:** the deliberate promo-name-only cache passed16/16 in the published UI, but an actual same-runtime public counterexample kept900 instead of changing to800 when codeX changed from100 to200 cents off. A hidden case now enforces the already stated same-name discount rule; wrong candidate retained as regression.
- **JS-006 delimiter collision:** independent static review found that the second private alternative used unescaped SKU delimiters. Valid SKU `a:1x1,b` collides with two prior lines. The alternative now uses structural serialization; its old code is a wrong regression variant and the exact replay is a case. Runtime regression validation passed in the final full publish suite.
- **PY-007 Unicode:** both the casefold candidate and lower-only wrong candidate passed15/15 in the published UI. Actual browser-runtime Straße/STRASSE and Σ/ς probes accept the former and reject the latter against the visible caseless requirement. Reference and lower-only alternative corrected; cases and clarifying examples added without requiring accent removal or canonical normalization.
- **PY-010 helper:** prose limits plain amounts to two places, but actual browser-runtime calls through the supplied helper accepted1.000 and1e2. The helper now enforces lexical plain-decimal precision and exact integer cents; old permissive code is retained as a wrong variant. Brackets explicitly mean negative magnitude, resolving the signed-inner reading. The blind solver authored a separate second candidate from updated public material only.

## Execution and review

All69 original normal-UI first candidates passed, all69 recovered and retained completion after reload, and all code/revision/feedback receipts matched. Wrong variants rejected67; the two accepted variants above are explicit audit failures, not passes.

All187 blind-solver public-derived edge inputs were executed on both candidates in the same pinned browser runners. Three additional public-contract probes bring the total to190; only the two old PY-010 helper probes disagreed with their expected contract. Normal UI and direct-runner evidence are separately identified. A harness lookup initially omitted an older archived revision after a local wording change; it was corrected and completed entries preserved when resuming.

SQL schema, fixture arity, foreign-key and result semantics are documented in [sql-review.md](sql-review.md). All five SQL normal-UI and public-edge sequences passed with their blind correct candidates.

Independent review examined all69 ambiguity notes and the scoped fixes. No further mandatory wording changes emerged. Nulls, malformed inputs, pointer overlap and arbitrary numeric extremes were not promoted to defects without a promised contract. PY-005 exposes Python rounding; RB-002 does not promise general transliteration. Successful examples do not prove concurrency or memo performance universally; those static-check limitations remain explicit.

Final local-UI retests and all69 publish checks,142 unit tests, type checks and Cloudflare build passed. Current published inventory and all112 original archive bytes were reconciled. Final PR CI is checked separately. Merge/deploy was subsequently authorized after green checks; release execution receipts are recorded on PR55 and ENG-338.
