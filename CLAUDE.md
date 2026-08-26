# Mini Sentry

Framework-agnostic client-side error monitoring SDK plus a backend REST API, built as
an npm workspaces monorepo (`sdk/`, `demo/`, `backend/`). See `README.md` for a
project overview, `sdk/README.md` for the SDK's API/config/privacy reference, and
`docs/API.md` / `docs/API_EXAMPLES.md` / `docs/FRONTEND_HANDOFF.md` for the
backend's REST contract and integration guide.

The backend serves three separate frontend teams (landing/onboarding web app, web
dashboard, mobile app) building independently against `docs/API.md` — this repo does
not build any of those UIs; it only builds/owns the backend and API contract.

## Scope and history

This project is built one phase at a time against `plans/PROJECT_PLAN.md`.

- `plans/PROJECT_PLAN.md` — scope and the phase table (what's done, what's next).
- `plans/PROGRESS.md` — what was actually built/tested in each phase, verified against
  repo state, plus known limitations. Source of truth for "is X actually done."
- `plans/DECISIONS.md` — reasoning behind non-obvious choices, so they aren't
  re-litigated without cause.

Read these before assuming what exists — check `plans/PROGRESS.md`'s latest phase
before recommending or building on something that "should" be there.

All 13 phases are complete — the SDK MVP (0–6) and the full backend (7–13:
event ingestion, DB persistence/grouping, auth, project/API-key management,
error-query/dashboard API, realtime/notification foundation, and API
hardening/handoff). There is no next phase queued; treat any further backend
work (a real push provider, per-project CORS, password reset, Redis-backed
rate limiting, etc. — see `plans/DECISIONS.md`'s Deferred section) as new
scope to confirm with the user, not something to start proactively. Never
build dashboard/mobile/landing UI in this repo — backend/API only.

## Commands (run from repo root; workspaces: `sdk`, `demo`, `backend`)

- `npm run dev` — builds the SDK, starts the demo's Vite dev server (localhost:5173)
- `npm run dev:backend` — starts the backend's Next.js dev server (localhost:3000);
  requires a running Postgres (`docker compose -f backend/docker-compose.yml up -d`)
  and `backend/.env` (copy from `.env.example`)
- `npm run db:migrate -w backend` / `npm run db:seed -w backend` — apply Prisma
  migrations / seed a dev project + print its API key
- `npm run build` / `npm run test` / `npm run typecheck` — across all three workspaces

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

### Backend (`backend/`) conventions

- **Centralized error handling**: `backend/src/lib/errors.ts`'s `ApiError`/`jsonError()`
  is the single choke point for the `{success:false, error:{code,message}}` response
  shape. A route's top-level `try/catch` must map any non-`ApiError` exception to
  `ERRORS.INTERNAL_ERROR()` — never let a caught error's own `.message` reach a
  response body (that could leak DB errors/internals).
- **Request validation**: zod schemas in `backend/src/lib/*Schema.ts`, matching the
  SDK's wire types exactly (currently `eventSchema.ts` mirrors `CapturedEvent`).
  Prefer truncating overlong string fields over rejecting the whole request — see
  `eventSchema.ts`'s `normalizeEvent()`.
- **API keys**: stored hashed (`lib/apiKey.ts`'s `hashApiKey()`, SHA-256), never raw.
- **CORS**: `lib/cors.ts`'s `resolveCorsHeaders(origin, allowedMethods)` reflects an
  origin only if it's in the `CORS_ALLOWED_ORIGINS` env allowlist — never a blind
  `*`. **Always pass the route's real `allowedMethods`** (a local `ALLOWED_METHODS`
  constant matching that route's `METHOD_NOT_ALLOWED(...)` string) — omitting it
  silently defaults to `"POST, OPTIONS"`, which broke real browser preflight for
  every non-POST-only route until Phase 13 caught it. Every method handler
  (including the 405 stubs) must receive `request` and pass CORS headers, even on
  error paths.
- **Prisma**: schema at `backend/prisma/schema.prisma`; `backend/src/lib/db.ts` is the
  shared client singleton (reused across dev hot-reloads via `globalThis`). Treat
  already-shipped model fields as additive-only across phases — see `plans/DECISIONS.md`.
- **Group-then-persist pattern**: `backend/src/lib/fingerprint.ts`'s
  `computeFingerprint()` + `backend/src/lib/persistEvent.ts`'s `persistEvent()` (a
  single Prisma `$transaction` upserting the group, then creating the event row) is
  the established pattern for writing grouped/aggregated data — keep group-counter
  updates and the row they're counting in the same transaction.
- **Reserved-but-unpopulated columns** (`ErrorEvent.os`/`.metadata`): fine to add a
  column ahead of having real data for it, as long as it's explicitly documented as
  reserved/`null` (in `docs/API.md` and `PROGRESS.md`) rather than silently faked.
- **Two independent bearer-token namespaces**: project API keys (`lib/apiKey.ts`,
  events ingestion) and user session tokens (`lib/session.ts`, everything else) both
  use `Authorization: Bearer <token>` and unsalted `sha256Hex()` (`lib/hash.ts`)
  hashing — but are looked up in different tables and never interchangeable.
  `lib/bearer.ts`'s `extractBearerToken()` is shared by both. Passwords are hashed
  differently (`lib/password.ts`, salted `scrypt`) — never reuse token hashing for a
  user-chosen secret.
- **Auth error codes**: `VALIDATION_ERROR` (bad request shape, auth endpoints) is
  separate from `INVALID_EVENT` (events endpoint) even though both are `400` —
  keep endpoint-family-specific error codes distinct rather than reusing one across
  unrelated concerns. `INVALID_CREDENTIALS` (login) and `INVALID_SESSION`
  (unknown/expired token) are also distinct from `INVALID_API_KEY`.
- **Ownership-scoped queries, not fetch-then-check**: every project lookup/mutation
  in `lib/project.ts` filters `where: { id, ownerId }` in the query itself
  (`findFirst`/`updateMany`/`deleteMany`), never "fetch by id, then compare owner in
  JS" — the latter is one accidental refactor away from an IDOR bug. Follow this
  pattern for any future user-owned resource. Also: return `404`, never `403`, for a
  resource that exists but isn't the caller's — `403` leaks that the id is real.
- **Test gotcha**: an `ApiError` built from a module imported before a test's
  `vi.resetModules()` fails `instanceof ApiError` inside code imported after that
  reset (different module-registry epoch, different class identity) — silently
  turns an intended `401` test into a passing-looking `500`. When a mocked function
  needs to reject with a typed error class, import that class fresh *inside* the
  post-reset setup, not at the test file's top level. See `projects/route.test.ts`'s
  `freshRoute()` for the pattern.
- **Representative group fields, captured once**: `ErrorGroup.message`/`.type`/
  `.endpoint`/`.statusCode`/`.environment` are all set on the group's `create`
  branch only (`lib/persistEvent.ts`), never on `update` — a stable summary per
  group, not live-recomputed. Follow this pattern for any new group-summary field;
  don't add one that needs to reflect the *latest* occurrence (for that, query
  `ErrorEvent` directly, the way group detail's `stack` does — see
  `lib/errorQuery.ts`'s `getErrorGroupDetail()`).
- **`parseQueryOrThrow()`** (`lib/errorQuerySchema.ts`) is the shared pattern for
  validating a route's query string against a zod schema — throws
  `400 VALIDATION_ERROR` on failure, matching the request-body validation pattern
  used elsewhere. Reuse it for any new list/filter endpoint instead of hand-rolling
  the parse-and-check-issues block again.
- **Provider abstractions get a real (not fake) placeholder implementation**:
  `lib/notification.ts`'s `NotificationService` interface + `getNotificationService()`
  factory is the pattern for "prepare for X without integrating X yet" — write the
  interface, write one concrete implementation that's honest about what it actually
  does (here: logs instead of delivering), and route all call sites through the
  factory so swapping in a real implementation later touches one function, not
  every call site.
- **Best-effort side effects are caught at the call site, not inside the library
  function**: `notify.ts`'s `notifyIfNeeded()` lets errors propagate; `events/route.ts`
  wraps the call in its own `try/catch` *after* the critical write (`persistEvent`)
  has already committed. Don't bake "swallow errors" into a library function itself —
  decide that at the one call site that actually needs the best-effort policy.
- **`agentRules: false`** is set in `backend/next.config.mjs` — Next.js 16 otherwise
  auto-generates its own `AGENTS.md`/`CLAUDE.md` inside `backend/` on every dev/build
  run, which would collide confusingly with this repo's own hand-authored root
  `CLAUDE.md`. Don't remove that config.
- **Rate limiting**: `lib/rateLimit.ts`'s `checkRateLimit(key, max, windowMs)` is a
  simple in-memory fixed-window counter — no Redis. Always key on an
  already-validated value (a zod-validated email, a real project id resolved from a
  verified API key) — never on raw/unvalidated input, which would let an attacker
  grow the in-memory store with arbitrary garbage keys. On a `429`, use
  `ERRORS.RATE_LIMITED(retryAfterSeconds)` — `jsonError()` automatically turns
  `ApiError.retryAfterSeconds` into a `Retry-After` header.

## Testing

- SDK: Vitest, `jsdom` environment (`sdk/vitest.config.ts`).
- Backend: Vitest, `node` environment (`backend/vitest.config.ts`), mocking Prisma
  (`vi.doMock("./db", ...)` / `vi.doMock("@/lib/apiKey", ...)`) rather than hitting a
  real database in the default `npm run test` run. DB-gated integration tests use
  `describe.skipIf(!process.env.DATABASE_URL)` — several exist per-phase (e.g.
  `events/route.integration.test.ts`, `auth/flow.integration.test.ts`), plus one
  canonical whole-system test,
  `backend/src/app/api/v1/e2e.integration.test.ts`, driving the brief's exact
  main-flow + mobile-flow acceptance criteria end to end.
- Modules with module-level singleton state (`core/state`, `capture/store`,
  `capture/network`, `transport/send`, `ui/notification`, `backend/src/lib/db`, etc.)
  are tested with `vi.resetModules()` + a dynamic `import()` per test, so state doesn't
  leak across cases — follow this pattern for new stateful modules instead of a manual
  reset function.
- No test files may leak into `sdk/dist/` or `backend/.next/` — verify with
  `find sdk/dist -iname '*.test.*'` / `find backend/.next -iname '*.test.*'` after a
  build when touching build config.

## Workflow habit established in this repo

Each phase in `plans/PROJECT_PLAN.md`, once implemented and verified (typecheck +
test + build all green, no dist leaks), gets its own commit, followed by a small
doc-only commit recording that commit's hash back into `plans/PROGRESS.md`. Keep
following this pattern for new phases unless the user says otherwise.
