<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The web app

The product is a 9-to-5 job before AI: issues on a board, a VS Code-style IDE, tests, pull requests. Repo-wide rules are in the root `AGENTS.md`; this file covers `apps/web`.

## Map

- `app/page.tsx`: the public home page. `app/(browse)`: dashboard, issues, projects, board and pull requests. Pages read the catalog (`content/catalog.json`) through `lib/library.ts` and `lib/queries.ts` (pure, tested).
- `app/work/[key]`: the IDE (`ide.tsx`) on the issue's live revision. Its repo is the revision's files (`lib/repo.ts` generates them at authoring time and maps them back with `repoOf`): the file to edit, a read-only test file in the language's usual style, a schema or README.
- `app/workspace`: the editor (`editor.ts`, CodeMirror 6), the session that records edits and runs (`session.ts`), save state, and the TypeScript type checker (`type-checker.ts`, its own worker).
- `app/_terminal`, `app/settings`: settings, as a terminal (`?run=` opens one command). Profile questions are asked in place by `app/(browse)/_components/ask.tsx` ([docs/profile.md](../../docs/profile.md)).
- Runners live outside the app, in `packages/runner` (see the root `AGENTS.md`).

## Conventions

- Params and searchParams are Promises (Next 16). Gate pages with `requireConsent(path)`.
- Anything read from localStorage or IndexedDB is read after mount, never during render, or hydration breaks.
- Revision JSON goes to client components as a string and is parsed there: the RSC serializer drops a `"__proto__"` key, and fixtures use one on purpose.
- The editor owns its document; typing must never re-render React.
- UI copy is plain and specific, in the voice of a workplace tool. Errors say what happened and whether it is the person's code ("not your code" for runtime failures).

## Checking a change

- `npm test` at the root and `npx tsc --noEmit -p apps/web`.
- Look at UI changes in the running app (`npm run dev`, then `/work/<KEY>`). Runtime files are built by `predev`; the first run builds the Go and C# runners in Docker.
- After route renames, `rm -rf apps/web/.next` and restart the dev server.
