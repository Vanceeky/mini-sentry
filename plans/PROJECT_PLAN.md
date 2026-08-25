# Mini Sentry — Project Plan

Lightweight, framework-agnostic client-side error monitoring SDK. This document is the
source of truth for scope and phasing. Work proceeds one phase at a time; a phase is
only considered complete when its acceptance criteria are verified against the actual
repository state (not assumed from a prior session).

## Guardrails (apply to every phase)

- Minimalism: prefer the simplest working implementation, avoid unnecessary
  dependencies/abstractions.
- SDK is framework agnostic: no React/Next.js/Vue/Angular dependency.
- SDK must never break or alter the behavior of the host application (errors are
  isolated, fetch/XHR semantics are preserved).
- Privacy by default: never capture passwords, auth tokens, cookies, authorization
  headers, full bodies, or sensitive form values.
- No fake/placeholder functionality presented as working; document gaps explicitly.
- Every major SDK capability has a test or reproducible demo.

## Phases

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Repository foundation — npm workspaces monorepo, TS build, demo scaffold | Complete |
| 1 | SDK core — `init()`, configuration, safe internal error handling | Not started |
| 2 | Error capture — `window.onerror`, `unhandledrejection`, normalized event format | Not started |
| 3 | Network error capture — fetch interception, non-success responses | Not started |
| 4 | Local event transport — POST to configurable endpoint, graceful failure | Not started |
| 5 | Floating user notification — Shadow DOM UI, auto-dismiss | Not started |
| 6 | SDK polish — bundle size, privacy/perf review, README | Not started |
| 7+ | Backend, DB, dashboard, deployment, publishing — explicitly deferred | Not started |

Phases 7–13 (Next.js backend, PostgreSQL, project/API-key management, dashboard,
error grouping, Vercel deployment, npm publishing) are intentionally out of scope until
explicitly instructed. See `DECISIONS.md` for anything discovered early that belongs to
a future phase.

## Definition of done (SDK MVP)

A developer can install the SDK locally, initialize it with an API key, trigger a JS
error in the demo app, have the SDK capture it with useful context, send it to a
configured endpoint, and see a small non-blocking notification — with the host
application continuing to function normally throughout.

## Repository layout

```
mini-sentry/
  sdk/     framework-agnostic TypeScript SDK (npm workspace package @mini-sentry/sdk)
  demo/    minimal Vite + vanilla TS browser app consuming the local SDK
  plans/   PROJECT_PLAN.md, PROGRESS.md, DECISIONS.md (this directory)
```
