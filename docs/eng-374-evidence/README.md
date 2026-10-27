# ENG-374 verification evidence

All populated screens use **explicitly synthetic** practice records (fixture participant `synthetic-participant-374`, real public challenge keys/revisions, no code or player data). History and model receipts used a mocked browser transport: synthetic model names (`synthetic/model-a`, `synthetic/model-b`), not real benchmark results. Local dev server, Chromium, 27 October 2026.

| State | Desktop 1280×800 | Mobile 390×844 |
| --- | --- | --- |
| Rich: chapter 1, first viewport | [outcomes](rich-desktop-1-outcomes.png) | [outcomes](rich-mobile-1-outcomes.png) |
| Rich: chapter 2 timeline (fail → leave → return → finish, 3h gap shortened) | [story](rich-desktop-2-story.png) | [story](rich-mobile-2-story.png) |
| Rich: chapter 4 result grid (solved, stopped, no receipt, "too few yet" people) | [models](rich-desktop-4-models.png) | [models](rich-mobile-4-models.png) |
| Rich: chapters 5–6 (quiet confidence; resume the open challenge) | [surprise + next](rich-desktop-5-6-surprise-next.png) | |
| Partial: one unfinished attempt, no trace (the PDF case) | | [partial](partial-mobile.png) |
| Empty: new player | [empty](empty-desktop.png) | |
| Stealth | | [stealth](stealth-mobile.png) |

Observed in the browser:

- First viewport leads with the personal takeaway (rich/partial) or the invitation (empty); no date form, version IDs or caveat wall before it. Methods sit under "How this was worked out", "All measurements" and "About this report".
- All six chapters render with the rich fixture; the partial fixture yields only chapters 1 and 6 plus the labelled preview; the empty fixture yields the invitation and the preview.
- History and receipts load automatically without a button, and the device report renders before them ("adding your uploads…").
- 390px: no element outside the table/nav scrollers exceeds the viewport (`scrollWidth === innerWidth`).
- Turning stealth on (account change event) cleared the mounted report in the same tick and issued **zero** requests; the page then showed only the stealth notice.
- Race: a history response held for 1.5s across a private-boundary `start` was discarded (served, never rendered); the report re-read only after `finish`.
- Chapter nav links are anchors with `aria-current`; summaries, links, the comparison table region and share checkboxes are keyboard reachable. Bars animate only under `prefers-reduced-motion: no-preference`.

Automated: `npm run typecheck`; 301/303 tests on Node 22 (the two failures, `authoring/seed` and `content/publish`, need the private managed catalog copy, unavailable in this worktree by design); `next build --webpack` passes. New tests: `apps/web/lib/report.test.ts` (chapter selection, truthfulness guards, dedup, share text) and `apps/web/app/stats/stats.test.ts` (stealth, loading, empty, rich rendering).
