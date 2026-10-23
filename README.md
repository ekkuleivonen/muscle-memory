# Muscle Memory

Open-source coding Adventures for a useful personal checkup, with private feedback and reproducible assessments. Created by [Ekku Leivonen](https://github.com/ekkuleivonen). Initially free; early Foundation work, no hosted service yet.

An **Adventure** contains **Challenges**. Challenge **Attempts** produce versioned **Assessments**. Stories, order and clues matter, so encounter context stays attached to every Attempt.

## Run the Foundation reference

The contract spike uses Python 3.11+ with no dependencies. The product app is selected to use Next.js; the TypeScript app and Cloudflare build rehearsal are the next Foundation slice.

Run the contract spike:

```sh
PYTHONPATH=packages/core python3 -m unittest discover -s packages/core/tests -v
PYTHONPATH=packages/core python3 apps/reference/demo.py
```

The demo uses synthetic JSON answers. It validates the content → encounter → attempt → assessment path, preserving both content versions and the Challenge digest. It does not execute submitted code, store real participant data, or infer general ability. Scoring is a provisional fraction of fixture outputs correct; there is no leaderboard or calibrated ranking.

## Monorepo

- `packages/core/muscle_memory`: portable immutable contracts and pure assessment logic.
- `content/adventures`: story, presentation and pinned Challenge sequence.
- `content/challenges`: tasks, fixtures, hints, skills and assessment versions.
- `apps/reference`: executable synthetic acceptance flow.
- `docs/foundation.md`: boundaries, acceptance gates and next implementation slices.

The first audience is working developers practicing basic iteration and map handling. Python is the initial implementation language; structured answers keep the domain independent of a future runner or web framework. A Challenge is not tied to an escape room: field notes, mysteries, riddles and workouts can use the same model.

See [contributing](CONTRIBUTING.md) and [security](SECURITY.md). Licensed under MIT.
