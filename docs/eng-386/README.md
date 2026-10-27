# ENG-386: phones read, practice is desktop-first

Screenshots from `tools/browser/mobile-check.ts` in Chromium device emulation (viewport, touch, coarse pointer) against a production build (`next start`). Synthetic data only: a stealth or fresh synthetic profile, a synthetic shared-result card, the public JS-002 challenge, the line `// synthetic-eng386`, and one synthetic solve for the report. Uploaded history is a synthetic empty page or a synthetic 503. Uploads and every off-origin request were stopped in the browser. These are not real devices; WebKit/Safari did not run.

## Challenge links and practice

| | |
| --- | --- |
| ![Phone 320×640: challenge with "Open on a computer to solve."](phone-320-challenge.png) | ![Phone 390×844: the same](phone-390-challenge.png) |
| ![Phone 390: after "Solve here anyway", stacked panes with typed code kept](phone-390-solving-anyway.png) | ![Phone landscape 844×390: challenge to read, note on top](phone-landscape-challenge.png) |
| ![Tablet 820×1180 (touch): the full workspace, no note](tablet-820-challenge.png) | ![Desktop 1280×800: unchanged workspace; current section bright in the bar](desktop-1280-challenge.png) |

## Navigation, browsing and shared results

| | |
| --- | --- |
| ![Phone 390: menu open above the bar, ❯ marks challenges](phone-390-menu-open.png) | ![Phone landscape: menu open](phone-landscape-menu-open.png) |
| ![Tablet 820: menu open](tablet-820-menu-open.png) | ![Phone 390: challenge picker](phone-390-challenges.png) |
| ![Phone 390: a synthetic shared result](phone-390-shared-result.png) | |

## Stats on phones

| | |
| --- | --- |
| ![Phone 390: empty report](phone-390-stats-empty.png) | ![Phone 390: report after one synthetic solve](phone-390-stats-report.png) |
| ![Phone landscape: report with uploaded history unavailable (synthetic 503)](phone-landscape-stats-history-unavailable.png) | ![Phone 390: practice records unreadable (IndexedDB blocked), partial report](phone-390-stats-error-records.png) |
| ![Phone 320: profile unreadable, error page](phone-320-stats-error-profile.png) | ![Phone 390: stealth](phone-390-stats-stealth.png) |

Interactions asserted on phone 320, phone 390 and phone landscape, plus tablet and desktop where they apply:
- A shared result leads to its challenge, and a direct link keeps its address and title.
- The note appears only on phones. *Solve here anyway* reveals the panes, and typed code survives rotation and Back.
- The menu opens by touch and closes with Escape or an outside tap. Keyboard Enter/Tab/Enter works.
- The current location is marked, with `aria-current` `true` inside a section and `page` on it.
- Touch targets in the menu and bar are at least 44px.
- No page has horizontal overflow, and no page throws errors.
