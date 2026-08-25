# Mini Sentry

Lightweight, framework-agnostic client-side error monitoring SDK, built phase by
phase as an npm workspaces monorepo.

## Structure

```
sdk/    the SDK itself (@mini-sentry/sdk) — see sdk/README.md for API docs
demo/   a minimal Vite + vanilla-TS app that exercises every SDK capability
plans/  PROJECT_PLAN.md (scope/phasing), PROGRESS.md (what's verified, phase by
        phase), DECISIONS.md (reasoning behind non-obvious choices)
```

## Getting started

```
npm install
npm run dev
```

`npm run dev` builds the SDK and starts the demo's Vite dev server at
`http://localhost:5173`. Click the buttons on the page to trigger a JS error, an
unhandled rejection, a non-2xx fetch response, and a network failure — each is
captured, logged to the console, shown as a small floating notification, and (since
the demo configures a deliberately unreachable `endpoint`) attempted-and-gracefully-
failed as an HTTP send.

Other root-level scripts: `npm run build`, `npm run test`, `npm run typecheck` (all run
across both workspaces).

## Status

Phases 0–6 complete: repository foundation, SDK core (`init`/config), error capture
(`window.onerror`/`unhandledrejection`), network error capture (`fetch`), local event
transport, a floating notification UI, and this polish pass (bundle size review,
privacy scrubbing, defensive copies, README). See `plans/PROJECT_PLAN.md` for the full
phase table.

Phases 7+ (backend, database, project/API-key management, dashboard, error grouping,
deployment, npm publishing) are intentionally out of scope until explicitly
instructed — see `plans/PROJECT_PLAN.md`.
