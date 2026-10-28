# ENG-394 verification evidence

Settled, full-page screenshots of `/stats` from `tools/browser/stats-portrait-check.ts` (Chromium, reduced motion, local dev server, 28 October 2026; recaptured after the review fixes: unknown results as ?, the guarded copy fallback, the known-result share scope and the short-screen dialog). All practice is **synthetic**: the fixture trace replayed on real public challenge keys and revisions, a fixture participant, no code or player data. Uploaded history is answered in the browser (an empty page, slow, or a 503); no request leaves the machine. Web Share is stubbed and never opened; nothing was shared.

| State | Desktop 1280×800 | 390×844 | 320×640 | Landscape 844×390 |
| --- | --- | --- | --- | --- |
| Empty | [empty](1-empty-desktop-1280.png) | [empty](1-empty-phone-390.png) | [empty](1-empty-phone-320.png) | [empty](1-empty-phone-landscape.png) |
| One solve | [one](2-one-desktop-1280.png) | [one](2-one-phone-390.png) | [one](2-one-phone-320.png) | [one](2-one-phone-landscape.png) |
| Two solves | [two](3-two-desktop-1280.png) | [two](3-two-phone-390.png) | [two](3-two-phone-320.png) | [two](3-two-phone-landscape.png) |
| Rich (7 solves, 2 languages, usual languages set) | [rich](4-rich-desktop-1280.png) | [rich](4-rich-phone-390.png) | [rich](4-rich-phone-320.png) | [rich](4-rich-phone-landscape.png) |
| Share preview, rich | [share](share-rich-desktop-1280.png) | [share](share-rich-phone-390.png) | [share](share-rich-phone-320.png) | [share](share-rich-phone-landscape.png) |

Also: [share preview for one solve](share-one-desktop-1280.png), [no Clipboard or Web Share](share-unavailable-phone-320.png), [stealth turned on in another tab while the preview was open](stealth-while-sharing-phone-320.png).

The synthetic fixtures have no unknown result, so the ? mark is covered by derived-trace and render tests rather than a screenshot. The rich and one-solve screens were taken while the synthetic history reply was still pending ("Adding your earlier practice…"); the rich desktop shot shows the share button focused because focus returned to it after the preview closed.

Checked in the browser on every viewport (61 checks): the visuals and their text equivalents; the share preview opened by keyboard (desktop) or touch, copy (read back from the clipboard), Web Share (text only) and download each giving exactly the previewed text, with no request carrying it; Escape and Close, focus back on the button; repeated presses opening one preview; no Clipboard or Web Share; stealth from another tab and a private boundary while the preview is open (preview and text gone, not restored after); Back with it open and Forward again; a deferred Clipboard write refused after close, reopen, a second press, a summary change, a private boundary or stealth (no select-and-copy, no textarea, no Copied or failure; with the guard removed this check fails); every action in view as the preview opens, including at 844×390; no console or page errors. WebKit could not be launched on this machine (missing system libraries), so it is unchecked.
