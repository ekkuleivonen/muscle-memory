# Verified findings so far

- CS-002, published revision790005e37bae: visible starter XML says cents; task and public examples specify dollars. Blind first candidate followed the task and passed23/23 in production UI; wrong midpoint-rounding candidate failed15/23, and recovery passed23/23. Scoped repair changes starter comment to dollars, without changing grading or its signature. Updated revision/retest pending.
- PY-010: visible prose/helper mismatch suspected; first candidate passes16/16, deliberate signed-refund mistake fails8/16. Precision-specific actual-runtime probe pending; not yet marked repaired or verified.

## Accepted deliberate wrong variants — counterexample probes pending

- JS-006: normal UI accepted the blind solver's variant whose memo key includes the promo name but omits the discount value. The visible task explicitly permits same-name codes with different discounts. A public-derived same-name100→200-cent counterexample is awaiting actual runtime probing; no content repair claimed yet.
- PY-007: normal UI accepted both the blind casefold candidate and its lower-only wrong variant. The task requires non-ASCII caseless matching. A public-derived Straße/STRASSE counterexample is awaiting runtime probing; no semantic resolution claimed yet.
