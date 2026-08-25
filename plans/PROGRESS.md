# Progress Log

Source of truth for what has actually been built, verified against repo state (not
assumed). Update at the end of every phase.

## Phase 0 — Repository Foundation

**Status:** Complete

**What was built:**
- Root `package.json` converted to npm workspaces (`sdk`, `demo`), private, with
  `build`/`test`/`typecheck`/`dev` scripts.
- Shared `tsconfig.base.json` with strict TS compiler options.
- `sdk/` package (`@mini-sentry/sdk`): TypeScript source in `src/`, builds via `tsc` to
  `dist/`, tested with Vitest.
- `demo/` package: Vite + vanilla TypeScript app that imports `@mini-sentry/sdk` from
  the local workspace and renders a status message to the page.
- `plans/PROJECT_PLAN.md` and `plans/DECISIONS.md` created.

**Tests performed:**
- `npm install` at repo root
- `npm run typecheck` (both workspaces)
- `npm run build` (both workspaces)
- `npm run test` (sdk Vitest suite)
- `npm run dev` (Vite dev server boots for demo)

**Known limitations:**
- SDK has no real functionality yet — only a placeholder `isSdkLoaded()` export used
  to prove the build/import pipeline. Real API surface starts in Phase 1.
- No linting/formatting tool configured yet (deferred, see DECISIONS.md).

**Commit:** see git log for the "Phase 0" commit.

**Next phase:** Phase 1 — SDK Core (`init()`, configuration, safe internal error
handling).
