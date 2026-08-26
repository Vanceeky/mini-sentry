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

**Commit:** `afbaf64` — "Phase 1: SDK core (init, configuration, safe error handling)"

**Next phase:** Phase 2 — Error Capture (`window.onerror`, `unhandledrejection`,
normalized event format).

## Phase 2 — Error Capture

**Status:** Complete

**What was built:**
- `sdk/src/capture/types.ts` — the normalized `CapturedEvent` shape (`id`, `type`,
  `message`, `stack`, `url`, `timestamp`, `environment`, `browser.userAgent`).
- `sdk/src/context/environment.ts` — gathers `url`/`environment`/`browser.userAgent`
  (raw `navigator.userAgent` only, no UA parsing/guessing).
- `sdk/src/capture/normalize.ts` — turns a raw `ErrorEvent` or `PromiseRejectionEvent`
  into a `CapturedEvent`.
- `sdk/src/capture/listeners.ts` — `installGlobalErrorListeners()`, attaching via
  `window.addEventListener("error"/"unhandledrejection", ...)` (not by assigning
  `window.onerror`, so it composes with any existing handler and never suppresses the
  browser's own console logging). Installs at most once; every callback runs through
  `safeExec`.
- `sdk/src/capture/store.ts` — in-memory ring buffer (cap 50) holding captured events
  until a transport exists (Phase 4).
- `core/safe.ts` gained `info()` alongside `warn()`, used to log each capture to the
  console for now (no UI yet — that's Phase 5).
- `index.ts`: `init()` now installs the listeners after a successful initialization;
  added public `getCapturedEvents()`.
- `demo/index.html`/`demo/src/main.ts`: two buttons ("Trigger JS Error", "Trigger
  Unhandled Rejection") and a live "Captured events" log element.

**Tests performed:**
- `npm run typecheck` — clean.
- `npm run build` — sdk emits `dist/` (verified test files are not leaked into it),
  demo's Vite build succeeds.
- `npm run test` — 31 Vitest tests across 8 files, now running under the `jsdom`
  environment (added as a devDependency, as flagged in Phase 0/1 DECISIONS). Covers:
  environment capture, error/rejection normalization (Error and non-Error reasons),
  the capture store's ordering and buffer cap, the global listeners (dispatch-and-
  assert, install-once guard), and end-to-end `init()` → dispatch → `getCapturedEvents()`
  for both event types, plus confirming nothing is captured when `init()` was invalid.
- Manually confirmed via the Vite dev server (curl) that the demo's built bundle
  resolves `init`/`getCapturedEvents` from `@mini-sentry/sdk` correctly.

**Known limitations:**
- No browser tool was available in this session, so clicking the demo buttons was not
  verified directly by this agent — but the user confirmed live in Chrome (2026-08-25)
  that both the "Trigger JS Error" and "Trigger Unhandled Rejection" buttons populate
  the "Captured events" log as expected (see Phase 3 notes for the full session,
  which also exercised this).
- Cross-origin script errors will appear as `message: "Script error."` with no stack —
  this is a browser security restriction (`crossorigin`/CORS on the script tag), not
  something the SDK can work around.
- Nothing is sent anywhere yet — events are only buffered in memory (Phase 4 adds
  transport).
- No floating user-facing notification yet (Phase 5) — capture is currently only
  visible via the demo's log element and the console.

**Commit:** `aca5574` — "Phase 2: error capture (window.onerror, unhandledrejection)"

**Next phase:** Phase 3 — Network Error Capture (fetch interception, non-success
responses).

## Phase 3 — Network Error Capture

**Status:** Complete

**What was built:**
- `sdk/src/capture/types.ts` — `CapturedEventType` gained `"http"`, and `CapturedEvent`
  gained an optional `request: { url, method, statusCode? }` field (populated only for
  `"http"` events; `statusCode` is absent when the request failed outright rather than
  returning a response).
- `sdk/src/capture/network.ts` — `installFetchInterceptor()`, which wraps
  `window.fetch` once: on a resolved response with `!response.ok` (status outside
  200-299) it captures an `"http"` event with the status code; on a rejected fetch
  (network failure, CORS, DNS, etc.) it captures one without a status code. The
  original response is always returned and the original rejection always rethrown
  unchanged — the host app's fetch semantics are untouched. Only method/URL/status are
  captured, never headers or request/response bodies, per the privacy guardrail.
- `index.ts`: `init()` now also calls `installFetchInterceptor()`, sharing the same
  capture handler (record + log) used for the Phase 2 listeners.
- `demo/index.html`/`demo/src/main.ts`: two new buttons ("Trigger Failed Fetch (404)"
  hitting a same-origin route the dev server has no handler for, "Trigger Network
  Error" hitting an unresolvable host), and the capture log now renders the
  `request.method`/`request.url` for `"http"` events.

**Tests performed:**
- `npm run typecheck` — clean.
- `npm run build` — sdk emits `dist/` (verified `network.js`/`network.d.ts` present,
  no test files leaked), demo's Vite build succeeds.
- `npm run test` — 37 Vitest tests across 9 files (6 new in `network.test.ts`):
  non-success response captured with the response passed through unchanged to the
  caller, a successful (2xx) response not captured, a rejected fetch captured and
  rethrown unchanged, method defaulting to `GET` when unspecified, method read off a
  `Request` object when no `init` is passed, and the install-once guard.
- Manually confirmed via the Vite dev server (curl) that the demo serves the two new
  buttons and that the built bundle imports `installFetchInterceptor`.

**Known limitations:**
- Confirmed live in Chrome by the user on 2026-08-25: the "Trigger Network Error"
  button correctly produced an `[http]` entry (`Failed to fetch`, no status code, since
  the request never got a response). Also visible in that same session: the installed
  Claude for Chrome extension patches `window.fetch` itself (for its own agent/page
  observation), which occasionally surfaces as an extra, unrelated `unhandledrejection`
  in the demo's log — that's the extension's own instrumentation, not a bug in this
  SDK; it's expected noise when testing with that extension active.
- The "Trigger Failed Fetch (404)" button originally issued a GET, which Vite's dev
  server answers with its SPA fallback (`200`, serving `index.html`) rather than a real
  `404` — meaning that code path was never actually exercised. Fixed in Phase 4
  (changed to a POST, which Vite correctly 404s) and confirmed via curl; see Phase 4
  notes.
- **Follow-up 2026-08-25**: user confirmed live in Chrome, post-fix, that "Trigger
  Failed Fetch (404)" now correctly produces an `[http] HTTP 404 Not Found (POST
  /definitely-not-a-real-endpoint)` entry (screenshot reviewed). All four capture
  buttons confirmed working end-to-end in a real browser.
- XHR (`XMLHttpRequest`) is not intercepted, only `fetch` — deferred per
  `DECISIONS.md`'s Phase 0 note that XHR interception may be skipped if it adds
  substantial complexity relative to its value for this MVP.
- Nothing is sent anywhere yet — events are only buffered in memory (Phase 4 adds
  transport).

**Commit:** `c2ef6cf` — "Phase 3: network error capture (fetch interception, non-success
responses)"

**Next phase:** Phase 4 — Local Event Transport (POST to configurable endpoint,
graceful failure).

## Phase 4 — Local Event Transport

**Status:** Complete

**What was built:**
- `sdk/src/transport/send.ts` — `sendEvent(endpoint, event)`: a fire-and-forget POST of
  a single `CapturedEvent` as JSON (`Content-Type: application/json`, `keepalive: true`
  so the request can still complete if triggered right before the page unloads). A
  non-2xx response or a rejected fetch only produces a console warning — never a thrown
  exception, never surfaced to the host app. Captures its own `fetch` reference once at
  module load time, before `capture/network.ts` ever gets a chance to patch
  `window.fetch` — so the SDK's own outbound telemetry requests are never observed by
  its own network interceptor (which would otherwise turn a down endpoint into an
  `"http"` capture event, which would itself be sent, forever).
- `index.ts`: `init()`'s shared capture handler now calls `sendEvent(resolved.endpoint,
  event)` after recording/logging, but only when `config.endpoint` was provided — no
  endpoint means events are still captured and buffered in memory (as before), just
  never sent anywhere.
- Fixed a latent bug found while re-verifying Phase 3: the demo's "Trigger Failed Fetch
  (404)" button issued a GET, which Vite's dev server answers via its SPA fallback
  (`200`, serving `index.html`) instead of a real `404` — so that capture path was never
  actually exercised. Changed to a POST (Vite correctly 404s non-GET requests to
  unmatched routes), confirmed via curl.
- `demo/src/main.ts`: `init()` now configures `endpoint: "/mini-sentry/collect"` — a
  route that intentionally doesn't exist yet (no backend until Phase 7+), so every
  transport send fails and demonstrates the graceful-failure path live; the status
  message notes this so a console warning isn't mistaken for a bug.

**Tests performed:**
- `npm run typecheck` — clean.
- `npm run build` — sdk emits `dist/` (`transport/send.js`/`.d.ts` present, no test
  files leaked), demo's Vite build succeeds.
- `npm run test` — 42 Vitest tests across 10 files (5 new in `transport/send.test.ts`):
  POSTs the correct method/headers/JSON body to the configured endpoint, warns (without
  throwing) on a non-2xx response, warns (without throwing) when the fetch itself
  rejects, uses the fetch reference captured at module load even after `window.fetch`
  is reassigned afterward (the anti-recursion guarantee), and warns (without throwing)
  when no fetch is available at all.
- Manually confirmed via the Vite dev server (curl): POST to `/mini-sentry/collect` and
  to `/definitely-not-a-real-endpoint` both correctly return `404` (vs. the `200` a GET
  would get from Vite's SPA fallback), and the served bundle contains the new
  `sendEvent`/`/mini-sentry/collect` wiring.

**Known limitations:**
- No retry, batching, or queueing — one event in, one POST out, fire-and-forget. A
  transport failure is only logged to the console; the event is not re-sent or held for
  a later retry (beyond still being available in memory via `getCapturedEvents()`).
  Matches the project's "simplest working implementation" guardrail; revisit only if a
  real use case needs delivery guarantees.
- **Follow-up 2026-08-25**: user confirmed live in Chrome (screenshot reviewed) —
  `[mini-sentry] transport endpoint responded with HTTP 404` appears in the console
  immediately after each capture, exactly as designed.
- Nothing is received anywhere — `/mini-sentry/collect` has no backend (Phase 7+,
  explicitly deferred). This phase only proves the SDK's send-side behavior.

**Commit:** `0f3eb2d` — "Phase 4: local event transport (POST to configurable endpoint,
graceful failure)"

**Next phase:** Phase 5 — Floating User Notification (Shadow DOM UI, auto-dismiss).

## Phase 5 — Floating User Notification

**Status:** Complete

**What was built:**
- `sdk/src/ui/notification.ts` — `showCaptureNotification(event)`: renders a small
  toast into a Shadow DOM host (`mode: "open"`) appended once to `document.body`, so
  the host page's CSS can never bleed into the notification (or the notification's
  CSS into the host page). The host `<div>` itself is `position: fixed; inset: 0;
  pointer-events: none`, so it never blocks clicks anywhere on the page — only the
  individual toast elements (inside the shadow root) opt back into `pointer-events:
  auto`, for their dismiss button. Each toast auto-dismisses after 6s, or immediately
  on clicking its `×` button; both paths go through the same `removeToast()`
  (`clearTimeout` + DOM removal) so there's no dangling timer either way. Caps
  simultaneously visible toasts at 3 (oldest evicted first), so a burst of rapid
  errors can't flood the page with DOM nodes. The message shown is just
  `type: message` (e.g. "Error captured: boom") — no stack trace or request URL in the
  UI itself, since that level of detail belongs in the console/devtools, not a
  transient toast.
- `index.ts`: the shared `onCapture` handler now also calls
  `showCaptureNotification(event)` — every capture path (JS errors, unhandled
  rejections, non-success/failed HTTP requests) now shows a toast, independent of
  whether a transport endpoint is configured.

**Tests performed:**
- `npm run typecheck` — clean.
- `npm run build` — sdk emits `dist/` (`ui/notification.js`/`.d.ts` present, no test
  files leaked), demo's Vite build succeeds.
- `npm run test` — 48 Vitest tests across 11 files (6 new in `ui/notification.test.ts`,
  using `vi.useFakeTimers()`): a toast renders inside a Shadow DOM host appended to
  `document.body`; a second/third notification reuses the same host instead of
  creating a new one; a toast auto-dismisses after the timeout; a toast dismisses
  immediately on clicking its button; showing a 4th toast evicts the oldest (1st) while
  keeping the newest 3; and the function never throws when no `document` is available.
- Manually confirmed via `grep` on the built `sdk/dist/index.js`/`sdk/dist/ui/
  notification.js` that `showCaptureNotification`/`attachShadow` are present in the
  compiled output the demo's dev server actually serves.

**Known limitations:**
- **Follow-up 2026-08-25**: user confirmed live in Chrome (screenshot reviewed) —
  toasts render bottom-right with the expected `type: message` label (e.g. "Network
  error captured: HTTP 404 Not Found"), and clicking all four buttons in sequence
  multiple times showed at most 3 toasts on screen at once, with the oldest correctly
  evicted first. Auto-dismiss timing (~6s) and manual dismiss-by-click weren't
  separately confirmed live but are covered by the Vitest suite.
- No user-facing way to disable the notification UI (no `showNotifications: false` or
  similar config option) — not asked for, and the project brief's Definition of Done
  treats the notification as part of the MVP experience, not an opt-out. Revisit only
  if a real host app needs headless/silent mode.
- Uses `mode: "open"` for the shadow root (not `"closed"`), so the host page's own
  scripts could technically reach into `host.shadowRoot` if they wanted to — chosen so
  the SDK's own tests can assert on rendered content without a workaround; the
  isolation this phase actually cares about (CSS never leaking either direction) holds
  either way.

**Commit:** `2afcd28` — "Phase 5: floating user notification (Shadow DOM UI,
auto-dismiss)"

**Next phase:** Phase 6 — SDK Polish (bundle size, privacy/perf review, README).

## Phase 6 — SDK Polish

**Status:** Complete

**What was built:**
- **Bundle size review**: confirmed the SDK has zero runtime dependencies (only
  `typescript`/`vitest`/`jsdom` as devDependencies). The demo's Vite production build —
  SDK + demo app code together, minified — is `8.32 kB` (`3.37 kB` gzipped). Revisited
  the Phase 0 "plain `tsc`, no bundler" decision (flagged for reconsideration here) and
  kept it: the SDK ships plain ESM `dist/`, and any real consumer's own bundler (Vite,
  webpack, etc.) already does tree-shaking/minification, as the demo build shows. No
  UMD/IIFE `<script>`-tag build was added — never asked for, and nothing in this repo
  consumes the SDK that way.
- **Privacy review** — audited every field on `CapturedEvent` against the project's
  privacy guardrail and found one real gap: the captured page URL and request URL
  (`location.href`, and a `fetch` call's target URL) could contain a sensitive
  query-string value (e.g. `?token=...`, `?api_key=...`) verbatim. Fixed with
  `sdk/src/core/scrub.ts`'s `scrubUrl()`: redacts the value of any query parameter whose
  name matches `/token|secret|password|passwd|auth|key|session|jwt|credential/i` to
  `[Redacted]`, leaving the rest of the URL (and any non-sensitive params) untouched; a
  URL with nothing to redact is returned byte-for-byte unchanged. Wired into
  `context/environment.ts` (page URL) and `capture/network.ts` (request URL).
  Everything else already matched the guardrail (no headers/bodies/cookies/form
  values ever read) and is now documented explicitly in the new READMEs.
- **Defensive-copy fix** — `capture/store.ts`'s `getRecordedEvents()` was returning the
  live internal array (typed `readonly`, but TypeScript's `readonly` is compile-time
  only). A caller could still mutate it, corrupting the SDK's internal buffer. Now
  returns a shallow copy (`[...events]`); trivial cost given the 50-item cap.
- **Perf review** — confirmed no polling/interval loops anywhere, all listeners/
  interceptors install at most once (guarded), the ring buffer (50) and the
  notification cap (3) both bound memory/DOM growth under a burst of errors, and
  `array.shift()`/`splice()` costs are negligible at these sizes. No changes needed.
- **`README.md`** (repo root) and **`sdk/README.md`** added — project overview, dev
  setup, usage, config table, what's captured, privacy guarantees (including the new
  scrubbing behavior and its documented gaps), and safety guarantees, with pointers to
  `plans/` for full phase-by-phase detail.

**Tests performed:**
- `npm run typecheck` — clean.
- `npm run build` — sdk emits `dist/` (`core/scrub.js`/`.d.ts` present, no test files
  leaked), demo's Vite build succeeds (`8.32 kB` / `3.37 kB` gzip, noted above).
- `npm run test` — 57 Vitest tests across 12 files (9 new): `core/scrub.test.ts` (6 —
  redacts a single/multiple sensitive params case-insensitively, leaves a clean URL
  byte-for-byte unchanged, resolves a relative URL against `location` before scrubbing,
  never throws on a garbled string, empty string unchanged), plus one new case each in
  `environment.test.ts` (page URL redaction via `history.replaceState`),
  `network.test.ts` (request URL redaction), and `store.test.ts` (mutating a returned
  snapshot doesn't affect the internal buffer).

**Known limitations:**
- Query-string scrubbing is name-pattern-based, not exhaustive — a sensitive value
  under an unexpected param name (e.g. `?x=<secret>`) would not be redacted. This is a
  heuristic, not a guarantee; documented in both READMEs.
- Hash-fragment secrets (e.g. an OAuth implicit-flow `#access_token=...`) are not
  scrubbed — only query-string parameters are (see `scrub.ts`'s doc comment for why).
- Error `message`/`stack` are still captured verbatim — no scanning/redaction of
  arbitrary text, since that would need a much heavier heuristic (or ML-based) approach
  with a real false-positive risk; documented as the host app's responsibility to avoid
  putting secrets in thrown error messages.
- **Follow-up 2026-08-25**: user confirmed live in Chrome — navigating to
  `http://localhost:5173/?token=abc123` and triggering a capture produced a captured
  event with `url: "http://localhost:5173/?token=%5BRedacted%5D"`; the raw token value
  never appeared in the captured data. All Phase 6 changes are now confirmed both by
  the Vitest suite and live in a real browser.

**Commit:** `c949878` — "Phase 6: SDK polish (bundle size review, URL privacy
scrubbing, defensive copy, README)"

**Next phase:** Phase 7 — Backend: Event Ingestion API.

## Phase 7 — Backend: Event Ingestion API

**Status:** Complete

**What was built:**
- New `backend/` npm workspace (`@mini-sentry/backend`): Next.js 16 (App Router,
  Turbopack), TypeScript, added to root `package.json`'s `workspaces` and a new
  `dev:backend` script (the existing demo-focused `dev` script is untouched).
- `backend/prisma/schema.prisma` — a minimal `Project` model (`id`, `name`,
  `apiKeyHash`, `createdAt`, `updatedAt`) via Prisma **6.19.3** (see Decisions — Prisma
  7's `latest` tag turned out to be a breaking-change release candidate requiring a
  separate config-file/adapter setup, so Prisma 6 was pinned instead). Migration
  `20260826025844_init_projects` committed under `backend/prisma/migrations/`.
- `backend/prisma/seed.ts` — upserts one `"Local Dev Project"` with a fixed, well-known
  dev-only API key (`mnst_dev_local_0000000000000000000000000000`), reused by the
  demo app, `docs/API_EXAMPLES.md`'s curl samples, and the integration test.
- `backend/src/lib/`: `constants.ts` (payload/field size caps), `errors.ts`
  (`ApiError`/`ERRORS`/`jsonError()` — the single choke point ensuring no DB error or
  internal detail ever reaches a response body), `cors.ts` (env-allowlist-based
  `resolveCorsHeaders()`), `apiKey.ts` (`hashApiKey()` — SHA-256, unsalted;
  `extractBearerToken()`; `findProjectByApiKey()`), `eventSchema.ts` (zod schema
  mirroring the SDK's `CapturedEvent` exactly, plus `normalizeEvent()` which truncates
  — not rejects — overlong strings), `db.ts` (Prisma client singleton, reused across
  dev hot-reloads via `globalThis`).
- `backend/src/app/api/v1/events/route.ts` — `POST /api/v1/events`: validates the
  `Authorization: Bearer <apiKey>` header shape → checks raw body size (32 KiB cap,
  before JSON parsing) → parses JSON → validates against the event schema →
  normalizes/truncates → looks up the project by hashed API key → responds
  `{success:true, eventId:"evt_<id>"}`. A top-level `try/catch` maps any unexpected
  error to a generic `INTERNAL_ERROR`. Also exports `OPTIONS` (CORS preflight, `204`)
  and `GET`/`PUT`/`DELETE`/`PATCH` (all `405 METHOD_NOT_ALLOWED`).
- **Events are validated and acknowledged but not yet persisted** — a structured
  `console.log` (`projectId`, `eventId`, `type`, `receivedAt`; deliberately excluding
  `message`/`stack`/`url`) is the only visibility into accepted events for now. Full
  persistence + grouping is Phase 8's job, once `error_groups`/`error_events` exist —
  see Decisions.
- **SDK amendment (Phase 4 follow-up)**: `sdk/src/transport/send.ts`'s `sendEvent()`
  now takes an `apiKey` parameter and sends `Authorization: Bearer <apiKey>` alongside
  `Content-Type: application/json` — closing a real gap found during Phase 7 planning:
  the SDK validated `config.apiKey` but never actually transmitted it, so no backend
  could have authenticated a request from this SDK before now. `sdk/src/index.ts`'s
  call site updated (`resolved.apiKey` was already guaranteed non-empty).
- `demo/src/main.ts` — `init()` now points at `http://localhost:3000/api/v1/events`
  with the seeded dev API key (replacing the Phase 4 placeholder, deliberately
  unreachable, `/mini-sentry/collect` endpoint).
- `docs/API.md` and `docs/API_EXAMPLES.md` (new) — full contract reference and
  runnable curl examples for every documented success/error case.
- Root `.gitignore` gained `.env`, `.env*.local`, `.next/`.
- `backend/next.config.mjs` sets `agentRules: false` — Next.js 16 otherwise
  auto-generates its own `AGENTS.md`/`CLAUDE.md` inside `backend/` on every dev/build
  run, which would sit confusingly alongside this repo's own hand-authored root
  `CLAUDE.md`.

**Tests performed:**
- `npm run typecheck` — clean across all three workspaces.
- `npm run build` — sdk (`dist/`), demo (Vite), and backend (`next build`, Turbopack)
  all succeed; `next build` prints `POST /api/v1/events` as the one dynamic route.
- `find sdk/dist -iname '*.test.*'` and `find backend/.next -iname '*.test.*'` — both
  empty, confirming no test files leak into either build output.
- `npm run test` — sdk: 57 Vitest tests across 12 files (unchanged count; 5 existing
  `transport/send.test.ts` cases updated for the new `apiKey` parameter/header).
  backend: 44 passed + 2 skipped across 6 files — unit tests for `cors` (allowed/
  disallowed/missing origin, never reflects a literal `*`), `errors` (response shape,
  status codes, generic `INTERNAL_ERROR` message), `apiKey` (hash determinism,
  bearer-token extraction, mocked-Prisma lookup), `eventSchema` (every required-field/
  enum/timestamp/`type:"http"`-without-`request` rejection case, acceptance of a
  *relative* `request.url`, truncation), and `route.test.ts` (every documented HTTP
  status/error code plus the success path, CORS header presence/absence, `OPTIONS`
  204, unsupported methods). The 2 skipped tests are the DB-gated
  `route.integration.test.ts` (`describe.skipIf(!process.env.DATABASE_URL)`), which
  only runs against a real Postgres.
- **Live end-to-end verification** (no browser tool available in this session, so
  driven via `curl` rather than an actual browser — see Known Limitations):
  1. `docker-compose up -d` (local Postgres, port 5433 — see note below), `prisma
     migrate dev --name init_projects` (applied cleanly), `npm run db:seed -w backend`
     (printed the dev key).
  2. `npm run dev:backend`, then curl'd every documented success/error path — status
     codes and response bodies matched `docs/API.md` exactly: `200` (error event),
     `200` (http event with a relative `request.url`), `401 UNAUTHORIZED` (missing
     header), `401 INVALID_API_KEY` (bad key), `400 INVALID_EVENT` (malformed JSON),
     `400 INVALID_EVENT` (`http` type missing `request`), `413 PAYLOAD_TOO_LARGE`
     (40 KB message), `405 METHOD_NOT_ALLOWED` (`GET`), `204` + correct headers for an
     `OPTIONS` preflight from an allowed origin, no CORS headers for a disallowed
     origin. The server's console log showed the expected `event accepted {...}` line
     for each successful POST.
  3. Started the demo's Vite dev server (`localhost:5173`) and curl'd
     `POST /api/v1/events` with `Origin: http://localhost:5173` (simulating the exact
     cross-origin request the SDK's `fetch` call would make) — got `200` with
     `access-control-allow-origin: http://localhost:5173` present, confirming the CORS
     configuration actually permits the demo's real origin. Also confirmed via the
     demo dev server's served source that `main.ts` resolves to the correct
     `apiKey`/`endpoint` values.
  4. Tore down both dev servers and the Postgres container after verification.

**Known limitations:**
- **No browser tool was available in this session**, so the demo's buttons were not
  clicked in an actual browser window — verification relied on the Vitest suites plus
  the curl-based checks in step 3 above (a same-shape cross-origin request with the
  right `Origin` header, which the backend's CORS logic can't distinguish from a real
  browser request). Recommend a quick manual check (start Postgres + backend + demo
  per the README, click each demo button, watch Network tab + backend console) when
  convenient.
- **Events are not persisted** — accepted events are validated and acknowledged only
  (a console log line, not a database row). Full persistence and error grouping is
  Phase 8's explicit job.
- **CORS is a single global env-var allowlist, not per-project** — every project
  currently shares one `CORS_ALLOWED_ORIGINS` list. Per-project origin allowlisting is
  a natural Phase 10 extension once there's an authenticated API for project owners to
  register their own origins.
- **No rate limiting** — deferred to Phase 13 (hardening) per the project's phased
  scope; nothing currently stops a high-volume sender from hitting this endpoint
  repeatedly beyond the per-request 32 KiB payload cap.
- **Pre-existing SDK discrepancy, not introduced here**: `sdk/src/transport/send.ts`'s
  `fetch` call still doesn't set `credentials: "omit"` explicitly, so it falls back to
  the fetch-spec default of `"same-origin"` — for a same-origin `endpoint` a cookie
  could technically be attached, which is a minor mismatch against the SDK's
  cookie-privacy claims. Noted here since it's directly relevant to this endpoint;
  fixing it wasn't part of Phase 7's scope.
- `npm audit` flags a high-severity stack-exhaustion advisory in `deepmerge-ts`, a
  transitive dependency of the `prisma` **CLI** package (not `@prisma/client`, which
  ships in the actual running server). It's a dev-only build/migration tool, not part
  of the request-handling runtime; the suggested fix (`npm audit fix --force`) would
  force-upgrade to Prisma 7, which has the breaking config change noted above. Left
  as-is; revisit if Prisma 6.x stops receiving security patches.
- Local Postgres runs on port **5433**, not the default 5432, specifically to avoid
  colliding with any Postgres a developer's machine already has running locally.
- On this machine, the Docker Compose **plugin** (`docker compose`) isn't installed —
  only the standalone `docker-compose` binary is. Both are documented in the README;
  use whichever is actually available.

**Commit:** `c2f8ed6` — "Phase 7: event ingestion API (backend workspace, Prisma,
POST /api/v1/events)"

**Next phase:** Phase 8 — Backend: Database & Event Persistence (full
`error_groups`/`error_events` schema, grouping logic).

## Phase 8 — Backend: Database & Event Persistence

**Status:** Complete

**What was built:**
- `backend/prisma/schema.prisma` extended with two new models, both with a
  foreign key back to `Project` (`onDelete: Cascade`):
  - `ErrorGroup` — `id`, `projectId`, `fingerprint`, `type`, `message`,
    `firstSeenAt`, `lastSeenAt`, `occurrenceCount`, timestamps. Unique on
    `[projectId, fingerprint]` (also the lookup index for upserts); a
    separate index on `fingerprint` and on `projectId`.
  - `ErrorEvent` — `id`, `projectId`, `groupId` (FK to `ErrorGroup`, cascade),
    `type`, `message`, `stack`, `url`, `method`, `statusCode`, `timestamp`,
    `browser`, `os`, `environment`, `metadata`, `createdAt`. Indexes on
    `projectId`, `groupId`, `createdAt`, `timestamp`.
  - `os` and `metadata` are nullable and **never populated** — the current
    `CapturedEvent` contract has no user-agent-parsed OS or `metadata` field
    to put there (see Decisions). Reserved columns, not faked data.
  - Migration `20260826031746_add_error_groups_and_events`, committed under
    `backend/prisma/migrations/`.
- `backend/src/lib/fingerprint.ts` — `computeFingerprint(event)`: SHA-256 of
  `type|message` (plus `method url` for `"http"` events, since their
  `message` is often a generic string shared across unrelated endpoints —
  see Decisions).
- `backend/src/lib/persistEvent.ts` — `persistEvent(projectId, event)`: a
  single Prisma `$transaction` that upserts the `ErrorGroup` by
  `[projectId, fingerprint]` (create with `occurrenceCount: 1`, or update
  `lastSeenAt` + `occurrenceCount: {increment: 1}`), then creates the
  `ErrorEvent` row pointed at that group. Atomic — a group's counter can
  never advance without the corresponding event row actually being written.
- `backend/src/app/api/v1/events/route.ts` — now calls `persistEvent()` after
  a successful API-key lookup, replacing Phase 7's "accepted but not stored"
  console log with real persistence (log line now includes `groupId`/
  `eventId`/`occurrenceCount`). **The response contract is unchanged** —
  `eventId` in the JSON response is still the client-supplied id echoed back
  (`evt_<id>`), not the database row id, so this phase is invisible to API
  consumers except for the fact that data now actually lands somewhere.
- `docs/API.md`/`docs/API_EXAMPLES.md` updated: grouping behavior documented,
  "not yet persisted" limitation removed, replaced with "no read API yet
  (Phase 11)" and the `os`/`metadata` reserved-column note.

**Tests performed:**
- `npm run typecheck` — clean across all three workspaces.
- `npm run build` — sdk, demo, and backend (`next build`) all succeed.
- `find sdk/dist -iname '*.test.*'` / `find backend/.next -iname '*.test.*'` —
  both empty.
- `npm run test` (no `DATABASE_URL`, default run): sdk unchanged at 57 tests;
  backend now 55 passed + 2 skipped across 8 files (12 new: 5 in
  `fingerprint.test.ts` — determinism, message/type sensitivity, http events
  grouped by method+url not just message; 4 in `persistEvent.test.ts` — the
  upsert/create call shape via a mocked Prisma `$transaction`, http
  method/statusCode population, non-http fields left undefined,
  post-increment `occurrenceCount` returned; 3 new cases in
  `route.test.ts` — `persistEvent` called with the right `projectId`/event,
  and a persistence failure maps to a sanitized `500 INTERNAL_ERROR` that
  never leaks the underlying error message).
- **With `DATABASE_URL` set** (real local Postgres): 59 passed, 0 skipped —
  the two DB-gated integration suites both ran: the existing
  `route.integration.test.ts` (API-key lookup) plus a new
  `persistEvent.integration.test.ts` proving a real
  `Project -> ErrorGroup -> ErrorEvent` chain persists on first occurrence,
  and that a second matching event increments the *same* group's
  `occurrenceCount` rather than creating a new one.
- **Live end-to-end verification** against a real local Postgres +running
  backend:
  1. Applied the new migration (`prisma migrate dev`), reseeded (idempotent
     upsert — same dev project id as Phase 7).
  2. POSTed the same `error` event 3 times via curl, then a differently
     shaped `http` event once. Confirmed via `psql` directly against
     `error_groups`/`error_events`: the 3 repeats collapsed into **one**
     `ErrorGroup` row with `occurrenceCount: 3` and 3 linked `ErrorEvent`
     rows sharing that `groupId`; the `http` event formed its own separate
     group (proving message-only grouping would have been wrong — see
     Decisions). Backend console log lines matched
     (`groupId`/`eventId`/`occurrenceCount` present, message/stack/url still
     excluded).
  3. Manually inserted a project + group + event row and deleted the
     project directly via `psql`, confirming `ON DELETE CASCADE` actually
     removes the dependent group/event rows (not just a Prisma-level
     assumption).
  4. Cleaned up test rows, tore down the dev server and Postgres container.

**Known limitations:**
- **Still no read API** — events are persisted and grouped, but there's no
  endpoint to query them back yet; that's Phase 11 (Error Query / Dashboard
  API). The only way to inspect stored data today is `npm run db:studio -w
  backend` or `psql` directly.
- **`os`/`metadata` are reserved, unpopulated columns** — no user-agent
  parsing exists (an explicit decision carried over from Phase 2/3), and the
  SDK's wire contract has no `metadata` field yet. Always `null`, not faked.
- **Fingerprinting is message-based, not stack-based** — the SDK sends a raw
  stack string, not structured frames, so grouping can't key off "same top
  frame" the way a real error tracker does. Two textually-different messages
  for what a human would consider "the same bug" (e.g. an error message that
  embeds a dynamic id) will form separate groups. Acceptable for this MVP;
  documented as a real limitation, not silently glossed over.
- **No browser tool was available in this session** (same as Phase 7) — live
  verification used curl + direct `psql` inspection of the resulting rows
  rather than clicking through the demo app in an actual browser.
- Same carry-over limitations as Phase 7: CORS is a global (not per-project)
  allowlist, no rate limiting yet, and the SDK's `fetch` call still doesn't
  explicitly set `credentials: "omit"`.

**Commit:** `af7928f` — "Phase 8: database & event persistence
(error_groups/error_events, grouping)"

**Next phase:** Phase 9 — Backend: Authentication API (register/login/logout/me).

## Phase 9 — Backend: Authentication API

**Status:** Complete

**What was built:**
- `backend/prisma/schema.prisma` gained `User` (`id`, `name`, `email` unique,
  `passwordHash`, timestamps) and `Session` (`id`, `userId` FK cascade,
  `tokenHash` unique, `expiresAt`, `createdAt`). Migration
  `20260826032744_add_users_and_sessions`, committed.
- `backend/src/lib/password.ts` — `hashPassword()`/`verifyPassword()` using
  Node's built-in `scrypt` (no new dependency) with a random salt per
  password, stored as `"<saltHex>:<derivedKeyHex>"`; `verifyPassword()` uses
  `timingSafeEqual`. `DUMMY_PASSWORD_HASH` — a precomputed hash of a fixed
  placeholder — lets login always run one scrypt computation even when no
  account matches the given email, so response timing can't reveal whether
  an email is registered.
- `backend/src/lib/session.ts` — `createSession(userId)` (random 32-byte
  token, returned raw exactly once; only its SHA-256 hash is stored, plus a
  30-day `expiresAt`), `findUserBySessionToken(rawToken)` (hash lookup +
  expiry check), `deleteSessionByToken(rawToken)` (idempotent `deleteMany`).
- `backend/src/lib/authSchema.ts` — zod schemas for register (`name`, `email`,
  `password`, 8–200 chars) and login (`email`, `password`, no minimum length
  — login shouldn't leak the registration password policy via a different
  error).
- Small refactor for reuse: `extractBearerToken()` moved to a new
  `backend/src/lib/bearer.ts` (used by both project-API-key auth and
  session auth); `apiKey.ts` re-exports it for backward compatibility.
  `backend/src/lib/hash.ts`'s `sha256Hex()` is now the single place both
  `hashApiKey()` and session-token hashing call.
- Four new routes under `backend/src/app/api/v1/auth/`:
  - `POST /register` — creates a `User` (hashed password), returns a safe
    representation (`id`/`name`/`email`/`createdAt`, never the password/hash).
    Does **not** auto-login.
  - `POST /login` — verifies credentials (wrong email and wrong password both
    produce the identical `401 INVALID_CREDENTIALS`, deliberately, to avoid
    user enumeration), creates a session, returns `{token, user}`.
  - `GET /me` — resolves the bearer session token, returns `{id, name, email}`.
  - `POST /logout` — deletes the session by token hash; idempotent (a
    missing header is still `401 UNAUTHORIZED`, but an unrecognized/expired
    token still returns `200 {success:true}`).
  - All four export `OPTIONS` (CORS preflight) and 405 handlers for
    unsupported methods, matching the events route's established pattern.
- `errors.ts` gained `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`,
  `INVALID_CREDENTIALS`, `INVALID_SESSION`; `PAYLOAD_TOO_LARGE()` and
  `METHOD_NOT_ALLOWED()` now take an optional parameter (max bytes / allowed
  method) instead of hardcoding the events-endpoint-specific defaults, so the
  same factories serve both event ingestion and auth. `UNAUTHORIZED()`'s
  message generalized from "Bearer \<apiKey\>" to "Bearer \<token\>" (still
  correct for events, now also correct for session auth).
- `constants.ts` gained `MAX_AUTH_PAYLOAD_BYTES` (4 KiB — auth bodies are
  tiny), `NAME_MAX_LEN`, `EMAIL_MAX_LEN`, `PASSWORD_MIN_LEN`/`MAX_LEN`,
  `SESSION_TTL_MS` (30 days).
- `docs/API.md` restructured: a new top-level Authentication section
  explaining the two independent bearer-token namespaces (project API key vs
  user session), a full Authentication API section (all 4 endpoints), CORS
  promoted to a top-level section (it now applies to every endpoint, not just
  events), and Known Limitations merged/updated for Phases 7–9.
  `docs/API_EXAMPLES.md` gained a full register->login->me->logout->me(fails)
  curl walkthrough plus duplicate-registration and wrong-credentials examples.

**Tests performed:**
- `npm run typecheck` / `npm run build` — clean across all three workspaces;
  `next build` lists all 4 new routes (`/api/v1/auth/{register,login,logout,me}`)
  alongside the existing `/api/v1/events`.
- `find sdk/dist -iname '*.test.*'` / `find backend/.next -iname '*.test.*'` — both empty.
- `npm run test` (no `DATABASE_URL`): backend now 109 passed + 6 skipped
  across 19 files (25 new test files/cases: `bearer.test.ts` (moved from
  `apiKey.test.ts`), `hash.test.ts`, `password.test.ts` (determinism of
  salting, correct/incorrect verification, malformed-stored-value handling,
  the dummy hash itself verifies), `session.test.ts` (mocked-Prisma create/
  find/delete, expiry handling), `authSchema.test.ts` (every validation
  case), and route tests for all 4 endpoints — auth failures, validation
  failures, duplicate email, CORS headers, unsupported methods, and (for
  register/login) asserting the response body never contains the raw
  password and the DB write always receives a hash, never plaintext.
- **With `DATABASE_URL` set**: 115 passed, 0 skipped — the 3 DB-gated
  integration suites all ran, including a new
  `auth/flow.integration.test.ts` that drives the actual route handlers
  (not mocks) through the full acceptance-criteria flow — register, login,
  `/me`, logout, `/me` again (confirms `401 INVALID_SESSION`) — plus a
  duplicate-registration-returns-409 case, both against a real Postgres.
- **Live end-to-end verification** via curl against a running backend +
  Postgres: registered a real account, confirmed the exact
  `409 EMAIL_ALREADY_REGISTERED` on a repeat, `400 VALIDATION_ERROR` for a
  malformed email, `401 INVALID_CREDENTIALS` for a wrong password, then the
  full login -> `/me` (200) -> `/me` with no header (401 UNAUTHORIZED) ->
  `/me` with a bogus token (401 INVALID_SESSION) -> logout (200) -> `/me`
  with the now-logged-out token (401 INVALID_SESSION) -> logout again (200,
  idempotent) sequence, plus a CORS preflight on `/auth/login`. Every status
  code and response body matched `docs/API.md` exactly. Cleaned up the test
  user and tore down the dev server/Postgres container afterward.

**Known limitations:**
- **No password reset flow** — the original brief made this optional
  ("implement only if it can be done safely and simply"); it needs an email
  delivery mechanism this backend doesn't have, so it was left out rather
  than half-built with no way to actually deliver a reset link.
- **No "log out everywhere" / session listing** — only the exact token
  presented to `/auth/logout` is invalidated; a user with multiple active
  sessions (e.g. web + mobile) can't revoke the others without their tokens.
- **No rate limiting on `/auth/login`** — deferred to Phase 13 along with the
  rest of the API's rate limiting; brute-force protection would normally live
  here specifically.
- **No browser tool was available in this session** (same as Phases 7–8) —
  live verification used curl end-to-end rather than a real browser or
  mobile client.
- Same carry-over limitations as Phases 7–8: CORS is a global (not
  per-project) allowlist, and the SDK's `fetch` call still doesn't
  explicitly set `credentials: "omit"` (irrelevant to auth endpoints, which
  never use cookies at all).

**Commit:** _pending_

**Next phase:** Phase 10 — Backend: Project Management API (projects,
API-key issuance/rotation).
