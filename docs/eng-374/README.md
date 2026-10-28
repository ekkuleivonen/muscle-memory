# ENG-374 screenshots

The screenshots come from local production builds (`next start`) in Chromium device emulation, not real devices. All data is synthetic. Uploads and every off-origin request were stopped in the browser.

## Stats

From `tools/browser/stats-portrait-check.ts`. The synthetic data:
- fixture practice traces on the live JS-001–JS-005 and PY-001 revisions, slowed and dated differently per attempt, with one later repeat of JS-001;
- a synthetic profile and a placeholder device identity;
- uploaded history as a synthetic empty page, a 6 s slow page or a 503, answered in the browser.

Reduced motion is on, so the dotted bars show their settled lengths. The page scrolls inside its own container, so `*-full.png` grow the viewport to the report's height and show the whole report, top to bottom. Each comes at `desktop-1280`, `phone-390`, `phone-320` and `phone-landscape`.

| File | What it shows |
| --- | --- |
| `*-1-empty-full.png` | No practice: one line and a start, then "Still to discover" |
| `*-2-one-full.png` | One solve: "Your first solve" as labelled lines, the next challenge linked at the top and below, then "Still to discover" naming a comparable challenge and a challenge at another difficulty |
| `*-3-two-full.png` | Two solves: "Your first two solves", the same way |
| `*-4-rich-full.png` | Seven solves, one a repeat: two compact takeaways, then the answers with bars only where they show a shape (confidence, difficulty, earlier and later, languages); uploads still arriving |
| `*-5-history-down.png` | Uploads failing: the device report stays, with a retrying line (first screen) |
| `invite-*-2-form-guess.png` | `tools/browser/languages-invite-check.ts`: the languages form opened from the report, with the quick-start guess named as a guess |
| `invite-*-4-report-answered.png` | The keyboard return path: back on the report at the answer after saving |

## `/start` language picker (owner request, same PR)

The picker on `/start?lang=python`, with PY-001 and PY-002 completed so Python offers PY-003 (the owner's case). `start-before-*.png` are the build before the change and `start-after-*.png` the build after it, at desktop-1280, phone-390, phone-320 and phone-landscape.

**Before:**
- the numbers 1–12 shift by a column at 10;
- "tally sheet" wraps under the language;
- on phones each row is cut off at the screen edge.

**After:**
- the rows are numbered 01–12 in one column;
- the challenge wraps under itself;
- on phones the challenge sits under the language.

`tools/browser/quick-start-check.ts` checks this at 1280, 761, 760, 601, 600, 390, 320 and 844 px, and drives the keyboard and touch.

## Status bar

| File | What it shows |
| --- | --- |
| `footer-1440.png` | The status bar on desktop: the site links centred in the bar, level with the trail |
