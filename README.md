# Mini Sentry

Lightweight, framework-agnostic client-side error monitoring SDK and backend API,
built phase by phase as an npm workspaces monorepo.

## Structure

```
sdk/      the SDK itself (@vanceeq/canary) — see sdk/README.md for API docs
demo/     a minimal Vite + vanilla-TS app that exercises every SDK capability
backend/  the REST API (@mini-sentry/backend) — Next.js + PostgreSQL/Prisma
web/      standalone Next.js dashboard (landing page, auth, projects, error
          browsing) — own toolchain, not an npm workspace member, see below
docs/     API.md (endpoint contract), API_EXAMPLES.md (curl walkthroughs),
          FRONTEND_HANDOFF.md (integration guide for the three frontend teams)
plans/    PROJECT_PLAN.md (scope/phasing), PROGRESS.md (what's verified, phase by
          phase), DECISIONS.md (reasoning behind non-obvious choices)
```

The backend was built for three separate frontend teams (a landing/onboarding
web app, a web dashboard, and a mobile app) working independently against the REST
contract in `docs/API.md` — this repo does not build any of those UIs, with one
explicit exception: `web/` (see `CLAUDE.md`). Start with `docs/FRONTEND_HANDOFF.md`
if you're integrating one of the other two.

### Web dashboard (`web/`)

```
cd web
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at your backend
npm install
npm run dev -- -p 3100             # a different port than the backend's own :3000
```
Also add `http://localhost:3100` to the backend's `CORS_ALLOWED_ORIGINS`
(`backend/.env`) for local dev.

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

**All 13 phases complete.** The SDK MVP (Phases 0–6): `init()`/config, error and
network-failure capture, local event transport, a floating notification UI, bundle
size/privacy review. The backend (Phases 7–13): event ingestion (`POST
/api/v1/events`) with fingerprint-based grouping and persistence into
PostgreSQL/Prisma; authentication (`register`/`login`/`logout`/`me`, bearer session
tokens, salted password hashing); project management (`GET`/`POST /api/v1/projects`,
`GET`/`PATCH`/`DELETE /api/v1/projects/:id`, API-key rotation), IDOR-safe throughout
(another user's resource 404s, never 403s); the error query / dashboard API
(`GET /api/v1/projects/:id/errors`, `.../errors/:groupId`, `.../events`,
`.../stats`), shared identically by the web dashboard and the mobile app; device
registration and a `NotificationService` abstraction (logged, not yet delivered — no
real push provider is wired up); and API hardening (a real CORS bug found and fixed,
rate limiting on login and event ingestion, a full security/consistency audit, and a
literal end-to-end acceptance test).

See `plans/PROJECT_PLAN.md` for the full phase table and Definition of Done,
`plans/PROGRESS.md` for what was actually built/tested/verified in each phase, and
`plans/DECISIONS.md` for the reasoning behind non-obvious choices — including known
limitations tracked for future work (a real push provider, per-project CORS,
password reset, Redis-backed rate limiting for multi-instance deployment, etc.),
none of which are in progress.

**Since Phase 13**, as new scope confirmed incrementally: the `web/` dashboard
(landing page, auth, projects, error browsing — see above); an SDK script-tag/CDN
build (`sdk/dist/canary.min.js`, a `Canary` global, no bundler needed);
`filename`/`line`/`column` capture for JS errors; and a new `"resource"` event type
capturing failed `<img>`/`<script>`/`<link>` loads (with a best-effort status code
via the Resource Timing API), which the original `fetch`-only network capture never
saw. Details and rationale in `plans/PROGRESS.md`'s and `plans/DECISIONS.md`'s
"Post-Phase-13" sections.
