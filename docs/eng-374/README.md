# ENG-374 Stats portrait screenshots

Screenshots from `tools/browser/stats-portrait-check.ts`, in Chromium device emulation against a local production build (`next start`). These are not real devices.

The data is synthetic only:
- fixture practice traces on the live JS-001–JS-005 and PY-001 revisions, slowed and dated differently per attempt;
- a synthetic profile and a placeholder device identity.

Uploaded history was a synthetic empty page, a 6 s slow page or a 503, answered in the browser. Uploads and every off-origin request were stopped there.

| File | What it shows |
| --- | --- |
| `phone-390-1-empty.png` | No practice: one line and a start, then "Still to discover" |
| `phone-390-2-one.png` | One solve, described as that solve; no takeaways; next challenge in its language; "Still to discover" names a comparable challenge |
| `phone-390-3-two.png` | Two solves: scoped "Across your two…" answers; next is JS-003 |
| `desktop-1280-4-rich.png`, `phone-320-4-rich.png`, `phone-landscape-4-rich.png` | Rich history: three takeaways, then the answers; uploads still arriving |
| `desktop-1280-5-history-down.png` | Uploads failing: the device report stays, with a retrying line |
