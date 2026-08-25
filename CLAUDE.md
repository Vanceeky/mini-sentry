# Mini Sentry

Framework-agnostic client-side error monitoring SDK, built as an npm workspaces
monorepo (`sdk/`, `demo/`). See `README.md` for a project overview and `sdk/README.md`
for the SDK's API/config/privacy reference.

## Scope and history

This project is built one phase at a time against `plans/PROJECT_PLAN.md`.

- `plans/PROJECT_PLAN.md` — scope and the phase table (what's done, what's next).
- `plans/PROGRESS.md` — what was actually built/tested in each phase, verified against
  repo state, plus known limitations. Source of truth for "is X actually done."
- `plans/DECISIONS.md` — reasoning behind non-obvious choices, so they aren't
  re-litigated without cause.

Read these before assuming what exists — check `plans/PROGRESS.md`'s latest phase
before recommending or building on something that "should" be there.

Phases 7+ (backend, database, project/API-key management, dashboard, error grouping,
deployment, npm publishing) are **explicitly out of scope** until the user asks for
them — don't start scaffolding for them proactively.

## Commands (run from repo root; workspaces: `sdk`, `demo`)

- `npm run dev` — builds the SDK, starts the demo's Vite dev server (localhost:5173)
- `npm run build` / `npm run test` / `npm run typecheck` — across both workspaces

## Conventions this codebase already follows — keep new code consistent

- **Error isolation boundary**: every public SDK entry point runs through
  `core/safe.ts`'s `safeExec()`. An internal SDK bug must never throw into the host
  app. Apply the same wrapping to any new capture/transport/UI code.
- **Never alter host app behavior**: `fetch` is wrapped, not replaced — the original
  response/rejection is always returned/rethrown unchanged. Global listeners use
  `addEventListener`, never `window.onerror =` (which would clobber the host's own
  handler and suppress default console logging).
- **Install-once guards**: anything that patches a global (`installGlobalErrorListeners`,
  `installFetchInterceptor`) uses a module-level `installed` flag.
- **Privacy**: never capture headers, bodies, cookies, or form values. Any captured URL
  goes through `core/scrub.ts`'s `scrubUrl()` to redact credential-looking query
  params. See `sdk/README.md`'s Privacy section before adding a new field to
  `CapturedEvent`.
- **No fake/placeholder functionality** — if something isn't implemented, say so in
  `plans/PROGRESS.md`'s "Known limitations," don't stub it silently.
- **Bounded buffers**: the in-memory event store (50) and the notification UI (3
  visible toasts) both cap growth so a runaway error loop can't blow up memory/DOM.
  Follow this pattern for any new stateful buffer.

## Testing

- Vitest, `jsdom` environment (`sdk/vitest.config.ts`).
- Modules with module-level singleton state (`core/state`, `capture/store`,
  `capture/network`, `transport/send`, `ui/notification`, etc.) are tested with
  `vi.resetModules()` + a dynamic `import()` per test, so state doesn't leak across
  cases — follow this pattern for new stateful modules instead of a manual reset
  function.
- No test files may leak into `sdk/dist/` — verify with
  `find sdk/dist -iname '*.test.*'` after a build when touching build config.

## Workflow habit established in this repo

Each phase in `plans/PROJECT_PLAN.md`, once implemented and verified (typecheck +
test + build all green, no dist leaks), gets its own commit, followed by a small
doc-only commit recording that commit's hash back into `plans/PROGRESS.md`. Keep
following this pattern for new phases unless the user says otherwise.
