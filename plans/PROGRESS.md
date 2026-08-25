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

**Commit:** `10bd3dd` — "Phase 0: repository foundation"

**Next phase:** Phase 1 — SDK Core (`init()`, configuration, safe internal error
handling).

## Phase 1 — SDK Core

**Status:** Complete

**What was built:**
- `sdk/src/core/config.ts` — `MiniSentryConfig`/`ResolvedConfig` types,
  `validateConfig()` (returns a list of human-readable errors instead of throwing),
  `resolveConfig()` (applies the `enabled: true` default).
- `sdk/src/core/id.ts` — `generateId()`, using `crypto.randomUUID()` with a manual
  fallback for environments where it's unavailable.
- `sdk/src/core/safe.ts` — `safeExec()`/`warn()`: the internal error-isolation
  boundary. Every public entry point runs through `safeExec` so an internal SDK bug
  can never throw into the host application.
- `sdk/src/core/state.ts` — in-memory singleton (`initialized`, `instanceId`,
  `config`) used internally by later phases (capture/transport) to know whether and
  how the SDK is configured.
- `sdk/src/index.ts` — the public `init(config)` API: validates, resolves defaults,
  guards against double-init, generates a per-instance id, and never throws.
- Updated `demo/src/main.ts` to call the real `init()` (replacing the Phase 0
  `isSdkLoaded()` wiring placeholder, which is now removed): one call with a valid
  key, one with a deliberately invalid config to demonstrate the host page keeps
  running.

**Tests performed:**
- `npm run typecheck` — clean.
- `npm run build` — sdk emits `dist/`, demo's Vite build succeeds.
- `npm run test` — 17 Vitest tests across 4 files (`config`, `id`, `safe`, `index`),
  covering: valid init, missing/blank apiKey, non-string endpoint, non-boolean
  enabled, non-object config (`null`/`undefined`/string), `enabled: false` as a
  no-op, duplicate `init()` calls being ignored, and `init()` never throwing even
  with malformed input.
- Manually confirmed via the Vite dev server (curl against the served module) that
  `demo/src/main.ts` resolves `init` from the built `@mini-sentry/sdk` package and
  transforms correctly.

**Known limitations:**
- No browser tool was available in this session, so the demo page was not visually
  driven in an actual browser window — verification relied on the Vitest suite (which
  directly exercises `init()`'s success/failure paths) plus confirming the dev server
  serves and resolves the module correctly. Recommend a quick manual check
  (`npm run dev` in `demo/`, open the page, check the console) when convenient.
- No error capture, transport, or UI yet — `init()` only establishes configuration
  and internal state. Nothing is sent anywhere yet.
- `capture/`, `context/`, `transport/`, `ui/` directories from the suggested
  architecture are not created yet; they'll be added in the phases that need them
  (2–5) rather than as empty scaffolding now.

**Commit:** see git log for the "Phase 1" commit.

**Next phase:** Phase 2 — Error Capture (`window.onerror`, `unhandledrejection`,
normalized event format).
