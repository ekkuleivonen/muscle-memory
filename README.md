# Muscle Memory

Friendly coding Adventures to test, practice and maintain the craft of writing code. AI is part of everyday development; Muscle Memory makes room to enjoy writing code yourself in your free time, with private feedback and room to improve.

Created by [Ekku Leivonen](https://github.com/ekkuleivonen), inspired by a developer’s observation of fading coding fluency while using AI more often. That observation is a starting question, not evidence of causation. Open source and initially free; early Foundation work. Only an owner-only preview is hosted, behind Cloudflare Access; there is no public service yet.

With voluntary research participation, we also hope to study how developer skills evolve over time and compare with coding models through aggregate results. Individual results stay private. Research collection and model benchmarking are later work; the current demo uses synthetic data only.

An **Adventure** contains **Challenges**. Challenge **Attempts** produce versioned **Assessments**. Stories, order and clues matter, so encounter context stays attached to every Attempt.

## Run the Foundation reference

The product app uses Next.js and TypeScript. With Node.js 22+:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The practice flow is session-only by default, with optional [device-local history](docs/device-local-practice.md). No practice records are uploaded. The [Python workspace preview](docs/workspace.md) at `/workspace` runs submitted Python only inside a network-denied browser sandbox, never on a server.

```sh
npm test
npm run build
npm run build:cloudflare
```

See [Cloudflare build notes](docs/cloudflare-build.md). No account or deployment is required for local builds.

The earlier contract spike uses Python 3.11+ with no dependencies.

Run the contract spike:

```sh
PYTHONPATH=packages/core python3 -m unittest discover -s packages/core/tests -v
PYTHONPATH=packages/core python3 apps/reference/demo.py
```

The demo uses synthetic JSON answers. It validates the content → encounter → attempt → assessment path, preserving both content versions and the Challenge digest. It does not execute submitted code, store real participant data, or infer general ability. Scoring is a provisional fraction of fixture outputs correct; there is no leaderboard or calibrated ranking.

## Monorepo

- `apps/web`: Next.js reference Adventure and local feedback.
- `packages/domain`: pure TypeScript assessment/event contracts and tests.
- `packages/catalog`: versioned authoring lifecycle and application eligibility gates.
- `packages/browser`: optional private device-local history.
- `packages/storage`: local transactional event store and retryable archive adapter.
- `packages/runner`: sandboxed in-browser Python runtime (pinned Pyodide, opaque-origin iframe, network denied).
- `packages/capture`: bounded, ordered capture of workspace observations with retry and gap disclosure.
- `packages/core/muscle_memory`: portable immutable contracts and pure assessment logic.
- `content/adventures`: story, presentation and pinned Challenge sequence.
- `content/challenges`: tasks, fixtures, hints, skills and assessment versions.
- `apps/reference`: executable synthetic acceptance flow.
- `docs/foundation.md`: boundaries, acceptance gates and next implementation slices.

The first audience is working developers practicing basic iteration and map handling. The initial contract spike is Python; the product app uses Next.js and TypeScript; structured answers keep the domain independent of a future runner or web framework. A Challenge is not tied to an escape room: field notes, mysteries, riddles and workouts can use the same model.

See [contributing](CONTRIBUTING.md) and [security](SECURITY.md). Licensed under MIT.

The [durable reference demo](docs/local-events.md) uses synthetic data to prove persisted, deduplicated events and retryable private JSON export: run `npm run demo:events` twice. `npm run demo:evidence` shows the capture-first contract: original submissions, including malformed ones, are stored before a separate, versioned assessment projection. The browser app keeps results in session memory unless device-local history is explicitly enabled.

See the [authoring lifecycle](docs/authoring.md) for draft, preview, test, publish, retire and disable commands. The reference app reads a generated published catalog and refreshes its eligibility before starts and assessments.
