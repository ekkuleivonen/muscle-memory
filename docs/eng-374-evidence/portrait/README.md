# ENG-374 portrait: visible experience and load times

Strictly synthetic: a store of 32 attempts (1,480 records, about 1 MiB) built from public challenge keys and the repo's synthetic trace, with mocked model results (`synthetic/model-a`). No player data. Local production build (`next build` + `next start`), Chromium, 27 October 2026.

Captured on the final source, `7aa3b17` plus the first-edit figure fix (its unit text is now small):

- [Mobile](mobile.png), 390×844, and [desktop](desktop.png), 1280×800. "How you code", then the questions this evidence can answer: first edit, iterate (with one model FYI), "You kept going: 16 solves came after a failed first submission.", edit sizes and languages. The fixture has no runs of typed code characters and its solves are at one difficulty level, so typing and difficulty are left out, not shown empty. Left padding is 16 px on mobile and 48 px on desktop; no sideways scroll; no internals.

## Measured (time from click or navigation)

| Case | Headline | Answers | Model FYI | Uploads settled |
| --- | --- | --- | --- | --- |
| Full reload of `/stats`, uploads route unavailable locally | first paint 52 ms, largest paint 60 ms | on screen at load | none (results unconfigured) | "couldn't be added" line |
| Cold in-app visit, uploads mocked at 1.5 s, model results at 0.6 s | 33 ms | 80 ms | 684 ms | 1,544 ms; answers never waited |
| Warm revisit, uploads route unavailable | 29 ms | 68 ms | none | immediate status line |
| Model results down (503) | unchanged | 5 answers | none, and no wording about models | n/a |
| Reset inside the open report | cleared in 2 ms | back from device evidence in 35 ms | n/a | no history request |
| Stealth turned on | stealth notice in the same tick | none | none | zero requests |

These timings were measured on the portrait before the metric-claim fixes; those fixes changed wording and which values are counted, not how anything loads. Model results load two at a time with one bounded retry (from the loading repair). That repair also measured a hung storage open: progress after 91 ms, the read settles at 8 s.
