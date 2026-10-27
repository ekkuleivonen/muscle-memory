# ENG-306: feedback and mobile practice

Baseline: `5c349e3f98e4c8600010abaea3e7c4c07ddfe3cc`. This is synthetic agent/browser QA, not human participant research. All synthetic upload requests are intercepted and refused; no production settings or recorded player data change.

## Before and after

| Check | Baseline production | Candidate |
| --- | --- | --- |
| Picker titles, 320px | 62 of 69 clipped | None clipped, including 200% font fixture |
| Picker titles, 390px | 46 of 69 clipped | None clipped, including 200% font fixture |
| JS-002 incorrect starter | 15 of 21 failed; 12 repetitive hidden rows visible | Public failures remain visible; 12 hidden failures share one category summary; all safe rows remain under Details |
| Mobile pane access | Description, code and feedback stacked with no direct navigation | Sticky Challenge / Code / Feedback controls; editor remains mounted |
| Edited code after a run | Prior output labelled Output | Prior output labelled Last run output — code edited since |

At 390px baseline, the description began at y=12, code at y=827 and feedback at y=1438. Navigation now brings the requested pane into view and preserves its reading offset. No grading, completion, capture or hidden-value policy changes.

## Acceptance method

`tools/browser/player-polish-check.ts` runs Chromium at 1280/320/390px and mobile WebKit at 390px. It checks repeated pane navigation, editor DOM identity, exact saved selection/caret ranges, code and editor scroll, mobile reading position, keyboard focus, safe collapsed diagnostics and expansion, stale feedback, incorrect submission → correction → completion → next challenge, long title wrapping and overflow. The 200% font fixture is not OS/browser text zoom or a physical phone/virtual-keyboard study.

Escape intentionally simplifies CodeMirror selections. Range-preservation testing uses CodeMirror’s Tab-focus-mode toggle then Tab, without changing the expected range; separate checks preserve the collapsed caret after Escape. The original failing range assertion was traced to that test precondition, not asynchronous restoration. Assertions were retained.

`tools/browser/practice-check.ts` additionally checks the existing player loop and recording contract. The hidden-data regression renders mixed failure categories and verifies that hidden inputs, outputs, private names, exception text and trace text stay absent, including expanded diagnostics.

Development-server caveat: initial WebKit runs encountered Fast Refresh navigation interruptions and one runtime access-control error. A minimal unchanged-baseline/candidate JS→Python comparison produced no errors on either. Final acceptance therefore uses a production build with the browser-error assertion intact; no errors are filtered out.

## Final local results

- 184 unit tests passed; both application typechecks passed.
- Production Cloudflare/OpenNext Worker build passed.
- Production Next server: Chromium 1280/320/390px and WebKit 390px passed all assertions, including zero page errors. Six Chromium and two WebKit upload requests were blocked.
- Existing practice loop/recording regression passed: picker start, challenge copy, failed/passing submissions, completion, optional questions afterward, resume, star, practise again and next challenge.
- Independent read-only source review found no concrete blocker, including hidden-data boundaries and final navigation assertions.
- No physical-device, OS text zoom or mobile virtual-keyboard testing is claimed. No production deployment is part of this candidate verification.
