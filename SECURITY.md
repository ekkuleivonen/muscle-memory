# Security and privacy

Muscle Memory runs every submission in the browser, inside an opaque-origin, network-denied sandbox (`packages/runner`, [practice](docs/practice.md)); nothing a player writes runs on a server or in the app's own page. Practice records are stored on the device and uploaded to the ingest Worker under a random participant ID, with a device secret proving ownership for uploads and deletion ([telemetry](docs/telemetry.md)). There are no passwords, names or emails.

Never relax the sandbox's CSP or run user code outside it. Keep participant records, exports and credentials out of git, and never post them in public issues. To report a vulnerability, use GitHub's private vulnerability reporting, or email support@rowandreason.com, before sharing details publicly.
