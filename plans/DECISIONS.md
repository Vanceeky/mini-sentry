# Decisions Log

Records notable decisions and deferred items, with rationale, so future sessions don't
re-litigate them without cause.

## Phase 0

- **Package name**: the SDK workspace package is named `@mini-sentry/sdk`, not the
  `@project/sdk` shown as an illustrative example in the project brief. Later docs/README
  should use the real name.
- **SDK build tool**: plain `tsc` (emits `dist/` with declarations). No bundler — the
  SDK is small enough that a bundler is unnecessary complexity for now. Revisit in
  Phase 6 (polish/bundle size) if output format (ESM-only vs UMD/IIFE for `<script>`
  tag consumption) needs reconsidering.
- **Demo tooling**: Vite (vanilla-TS template, no framework). Chosen because it gives a
  real browser dev server and build with local-workspace resolution and TS support for
  minimal dependency cost, without violating the "framework agnostic" constraint (Vite
  is a build tool, not a UI framework).
- **Test runner**: Vitest, `node` environment for Phase 0. `jsdom` environment will be
  added as a devDependency in Phase 2, when `window.onerror` / `unhandledrejection`
  capture needs to be tested against a DOM-like environment. Not added now to avoid
  carrying an unused dependency.
- **Linting/formatting**: skipped for Phase 0. The brief allows this ("if lightweight/
  useful"); with such a small codebase so far it doesn't yet earn its keep as a
  dependency. Can be revisited if the codebase grows enough to benefit.
- **Workspace dependency version**: `demo/package.json` depends on
  `"@mini-sentry/sdk": "*"` — npm workspaces resolves this to the local `sdk/` package
  via symlink because the name matches, regardless of it never being published to a
  registry.

## Phase 1

- **Error isolation boundary**: every public SDK entry point (currently just `init`)
  is wrapped in `core/safe.ts`'s `safeExec()`, which catches and warns instead of
  throwing. This is the single choke point later phases (capture/transport/ui) will
  also route through, per the "SDK must never break the host application" guardrail.
- **Invalid config behavior**: `init()` with an invalid config never throws; it logs a
  `console.warn` and leaves the SDK uninitialized (a silent no-op for capture/transport
  purposes) rather than partially initializing.
- **Duplicate `init()` calls**: a second call is ignored (with a warning) rather than
  resetting state — avoids surprising instance-id/config churn if a host app
  accidentally calls `init()` more than once (e.g. during dev-server hot reload).
- **`enabled: false` semantics**: treated the same as an invalid config for now (SDK
  stays uninitialized/no-op). No separate "initialized but disabled" state, since
  nothing downstream needs to distinguish them yet.
- **Instance ID**: `generateId()` (crypto.randomUUID with a fallback) produces a
  per-`init()` id stored in `core/state.ts`. It is not exposed publicly yet — it exists
  for later phases (capture) to tag events with, per the brief's "unique SDK
  instance/project ID" requirement.
- **Architecture folders**: only `sdk/src/core/` was created. The `capture/`,
  `context/`, `transport/`, `ui/` folders suggested by the brief are deliberately not
  scaffolded yet — they'll be created in the phase that actually needs them, to avoid
  empty/unused structure.
- **Phase 0 placeholder removed**: `isSdkLoaded()` and its test were deleted now that
  a real public API (`init`) exists; the demo was updated to call `init()` instead.

## Deferred (future phases, not implemented now)

- XHR interception (Phase 3): only fetch will be intercepted initially; the brief
  explicitly allows deferring XHR if it adds substantial complexity. Revisit and decide
  when Phase 3 is reached.
- Any backend/DB/dashboard/auth/deployment/publishing work (Phases 7–13): explicitly
  out of scope until instructed.
