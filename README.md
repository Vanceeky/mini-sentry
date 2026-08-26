# Mini Sentry

Lightweight, framework-agnostic client-side error monitoring SDK and backend API,
built phase by phase as an npm workspaces monorepo.

## Structure

```
sdk/      the SDK itself (@mini-sentry/sdk) — see sdk/README.md for API docs
demo/     a minimal Vite + vanilla-TS app that exercises every SDK capability
backend/  the REST API (@mini-sentry/backend) — Next.js + PostgreSQL/Prisma
docs/     API.md (endpoint contract), API_EXAMPLES.md (curl walkthroughs)
plans/    PROJECT_PLAN.md (scope/phasing), PROGRESS.md (what's verified, phase by
          phase), DECISIONS.md (reasoning behind non-obvious choices)
```

The backend is being built for three separate frontend teams (a landing/onboarding
web app, a web dashboard, and a mobile app) working independently against the REST
contract in `docs/API.md` — this repo does not build any of those UIs.

## Getting started

### SDK + demo

```
npm install
npm run dev
```

`npm run dev` builds the SDK and starts the demo's Vite dev server at
`http://localhost:5173`. Click the buttons on the page to trigger a JS error, an
unhandled rejection, a non-2xx fetch response, and a network failure — each is
captured, logged to the console, and shown as a small floating notification. Events
are also sent to the local backend if it's running (see below); otherwise the send
fails gracefully (console warning only).

### Backend API

```
docker compose -f backend/docker-compose.yml up -d   # or `docker-compose`, see below
cp backend/.env.example backend/.env
npm run db:migrate -w backend
npm run db:seed -w backend                            # prints a dev API key
npm run dev:backend                                    # http://localhost:3000
```

See `docs/API.md` for the full endpoint contract and `docs/API_EXAMPLES.md` for
runnable curl examples. Note: on some Docker installs the Compose plugin is invoked as
`docker compose` (built-in) vs. the standalone `docker-compose` binary — use whichever
is available.

Other root-level scripts: `npm run build`, `npm run test`, `npm run typecheck` (all run
across all three workspaces).

## Status

Phases 0–6 complete: repository foundation, SDK core (`init`/config), error capture
(`window.onerror`/`unhandledrejection`), network error capture (`fetch`), local event
transport, a floating notification UI, and an SDK polish pass (bundle size review,
privacy scrubbing, defensive copies, README).

Phase 7 complete: the event ingestion API (`POST /api/v1/events`) that the SDK posts
to, backed by a new `backend/` Next.js workspace and PostgreSQL via Prisma.

Phase 8 complete: events are now persisted and grouped (`Project -> ErrorGroup ->
ErrorEvent`, fingerprint-based) — there's still no API to read them back yet (that's
Phase 11).

Phase 9 complete: authentication (`register`/`login`/`logout`/`me`), bearer session
tokens (`Authorization: Bearer <token>`, same shape as project API keys), salted
password hashing. See `plans/PROJECT_PLAN.md` for the full phase table and
`plans/PROGRESS.md` for what was actually built and tested.

Phases 10–13 (project management, the error-query/dashboard API, notifications, and
final hardening) are intentionally out of scope until explicitly instructed, one
phase at a time — see `plans/PROJECT_PLAN.md`.
