# ENG-374 portrait: visible experience and load times

Synthetic store of 32 attempts (1,480 records, about 1 MiB), real public challenge keys, no player data. Model results and uploads were mocked where noted. Local production build (`next build` + `next start`), Chromium. 27 October 2026.

- [Mobile](mobile.png), 390×844: "How you code", then the questions this evidence can answer: first edit, iterate (with one model FYI), recovery, edit sizes and languages. The fixture has no runs of typed code characters, and its solves are at one difficulty, so typing and difficulty are left out, not shown empty. Recaptured after the metric-claim fixes (`1f27459`). Page padding 16 px, no sideways scroll.
- [Desktop](desktop.png), 1280×800: the same, at the shared 48 px left edge.

## Measured (time from click or navigation)

| Case | Headline | Answers | Model FYI | Uploads settled |
| --- | --- | --- | --- | --- |
| Full reload of `/stats`, uploads route unavailable locally | first paint 52 ms, largest paint 60 ms | on screen at load | none (results unconfigured) | "couldn't be added" line |
| Cold in-app visit, uploads mocked at 1.5 s, model results at 0.6 s | 33 ms | 80 ms | 684 ms | 1,544 ms; answers never waited |
| Re-run after the metric-claim fixes, uploads 0.8 s, model results 0.3 s | — | 110 ms | 110–860 ms | 860 ms |
| Warm revisit, uploads route unavailable | 29 ms | 68 ms | none | immediate status line |
| Model results down (503) | unchanged | 5 answers | none, and no wording about models | n/a |
| Reset inside the open report | cleared in 2 ms | back from device evidence in 35 ms | n/a | no history request |
| Stealth turned on | stealth notice in the same tick | none | none | zero requests |

Model results load two at a time (bounded retry once), from the loading repair. A hung storage open was measured by that repair: progress after 91 ms, the read settles at 8 s.
