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
- No browser tool was available in this session to click through the demo end-to-end
  after this change; verification relied on the Vitest suite plus the curl checks
  above. Please give the buttons a click and check the console shows
  `[mini-sentry] transport endpoint responded with HTTP 404` alongside each capture.
- Nothing is received anywhere — `/mini-sentry/collect` has no backend (Phase 7+,
  explicitly deferred). This phase only proves the SDK's send-side behavior.

**Commit:** _pending_

**Next phase:** Phase 5 — Floating User Notification (Shadow DOM UI, auto-dismiss).
