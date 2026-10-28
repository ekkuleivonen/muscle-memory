# ENG-394 comparison bridge: synthetic evidence

Development preview (`NEXT_PUBLIC_STATS_COMPARISON_PREVIEW=1`), Chromium, from `tools/browser/stats-comparisons-check.ts` (24 checks, 28 October 2026). Every reply is synthetic and answered inside the browser: cohort rows and model receipts shaped like ENG-376's tests (synthetic model names), and one uploaded-history summary. Nothing was requested from production or shared.

The uploaded summary is the device's own derived attempt marked `practice: "first"`. `derive` emits only "repeat" or "unknown", and both helpers take "first" (and the model one "repeat"), so without it neither line could show for a real attempt at backend head d343040. That is reported to ENG-376 and not changed here.

| State | 1280 | 390 | 320 | 844×390 |
| --- | --- | --- | --- | --- |
| Both lines (adult, 20 matched browsers, 4 matched models) | [both](desktop-1280-1-both-lines.png) | [both](phone-390-1-both-lines.png) | [both](phone-320-1-both-lines.png) | [both](phone-landscape-1-both-lines.png) |
| Age not answered; model runs in another setup | [notes](desktop-1280-2-age-missing-unmatched.png) | [notes](phone-390-2-age-missing-unmatched.png) | [notes](phone-320-2-age-missing-unmatched.png) | [notes](phone-landscape-2-age-missing-unmatched.png) |
| Too few players (model line still shown) | [few](desktop-1280-3-too-few-players.png) | [few](phone-390-3-too-few-players.png) | [few](phone-320-3-too-few-players.png) | [few](phone-landscape-3-too-few-players.png) |

The model line here is the outcome kind: the synthetic seed has no stored code artifact, so there's no local length. The code-length kind is covered by `comparisons.test.ts`. Also checked: personal answers render before a slow cohort reply; only the exact challenge revision is requested; stealth from another tab removes the lines with the report; a cohort reply in flight across a private boundary is discarded; an unavailable cohort says so; no request carries code; no console errors.
