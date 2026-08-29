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
| 1 | SDK core — `init()`, configuration, safe internal error handling | Complete |
| 2 | Error capture — `window.onerror`, `unhandledrejection`, normalized event format | Complete |
| 3 | Network error capture — fetch interception, non-success responses | Complete |
| 4 | Local event transport — POST to configurable endpoint, graceful failure | Complete |
| 5 | Floating user notification — Shadow DOM UI, auto-dismiss | Complete |
| 6 | SDK polish — bundle size, privacy/perf review, README | Complete |
| 7 | Backend: Event Ingestion API (`POST /api/v1/events`, Next.js + Prisma + PostgreSQL) | Complete |
| 8 | Backend: Database & Event Persistence (full `error_groups`/`error_events` schema, grouping) | Complete |
| 9 | Backend: Authentication API (register/login/logout/me) | Complete |
| 10 | Backend: Project Management API (projects, API-key issuance/rotation) | Complete |
| 11 | Backend: Error Query / Dashboard API (list/detail/stats, used by web dashboard + mobile) | Complete |
| 12 | Backend: Realtime/Notification foundation (device registration, notification service abstraction) | Complete |
| 13 | Backend: API Hardening & Handoff (docs, integration tests, security review) | Complete |
| 14 | Backend: Teams, Roles & Assignment (org-style team ownership of projects, invitations, superadmin bootstrap + oversight, error-group assignment) | Complete |

The backend (Phases 7–13) was built for three separate frontend teams
(landing/onboarding web app, web dashboard, mobile app) working independently
against the REST contract in `docs/API.md` — this repo does not build any of
those UIs, only the backend/API. All 13 phases were complete before Phase 14
(new scope, confirmed with the user rather than pre-planned) added
multi-user collaboration on top of the single-owner model. See
`DECISIONS.md` for the reasoning behind non-obvious choices made along the
way, and `docs/FRONTEND_HANDOFF.md` for the integration guide aimed at those
three teams.

## Backend guardrails (Phases 7–13)

- REST, not GraphQL; no microservices/Redis/Kafka/queues/Kubernetes.
- Every phase defines its API contract (request/response/auth/errors) before
  implementing, and updates `docs/API.md` / `docs/API_EXAMPLES.md`.
- No fake/placeholder endpoints — an unimplemented capability is a documented "Not
  started" row above, not a stub that looks real.
- Never build landing/dashboard/mobile UI in this repo.

## Definition of done (SDK MVP)

A developer can install the SDK locally, initialize it with an API key, trigger a JS
error in the demo app, have the SDK capture it with useful context, send it to a
configured endpoint, and see a small non-blocking notification — with the host
application continuing to function normally throughout.

## Definition of done (Backend)

A developer can register an account, log in, create a project, receive its API
key, configure the SDK with it, have a real captured event reach
`POST /api/v1/events`, get persisted and grouped, and be readable back via
the dashboard/mobile query endpoints (`GET .../errors`, `.../errors/:id`,
`.../events`, `.../stats`) — with every project-scoped endpoint IDOR-safe
(never leaking another user's data via status code or response shape),
every response using one consistent `{success, ...}` / error shape, the two
most abuse-prone endpoints (login, event ingestion) rate limited, and the
whole flow proven by an automated end-to-end integration test
(`backend/src/app/api/v1/e2e.integration.test.ts`) in addition to live
verification. See `plans/PROGRESS.md`'s Phase 13 entry for the full
hardening/security review this was checked against.

## Repository layout

```
mini-sentry/
  sdk/      framework-agnostic TypeScript SDK (npm workspace package @mini-sentry/sdk)
  demo/     minimal Vite + vanilla TS browser app consuming the local SDK
  backend/  REST API (npm workspace package @mini-sentry/backend) — Next.js + Prisma/PostgreSQL
  docs/     API.md (REST reference), API_EXAMPLES.md (curl walkthroughs),
            FRONTEND_HANDOFF.md (integration guide for the three frontend teams)
  plans/    PROJECT_PLAN.md, PROGRESS.md, DECISIONS.md (this directory)
```
