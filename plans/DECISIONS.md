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

## Phase 2

- **`addEventListener` over `window.onerror`/`window.onunhandledrejection`**: the
  brief names "window.onerror", but assigning that property is a single global slot
  that would clobber any handler the host app already set. `window.addEventListener`
  achieves the same capture without that risk and without suppressing the browser's
  default console error logging (assigning `window.onerror` and returning `true`
  would suppress it) — directly serving the "must not alter host app behavior"
  guardrail.
- **`environment` field**: fixed to the literal `"browser"` for now — a forward-
  compatible discriminator (in case a non-browser runtime is ever supported), not a
  user-configurable "prod/staging" label, since Phase 1's config has no such option
  and adding one wasn't asked for.
- **`browser` field**: only `navigator.userAgent`, verbatim. No parsing into name/
  version — that needs a UA-parsing library or a fragile regex, which is unnecessary
  complexity for a hackathon MVP; a full user agent string is still useful debugging
  context on its own.
- **Where captured events live until Phase 4**: a capped in-memory ring buffer
  (`capture/store.ts`, max 50) — nothing is sent anywhere yet, per the brief's Phase 2
  scope. Phase 4's transport will read from this same store.
- **Test environment**: switched Vitest's default environment from `node` to `jsdom`
  (as flagged in the Phase 0 decisions) now that capture code touches `window`,
  `ErrorEvent`, and `PromiseRejectionEvent`.
- **Listener tests use synthetic dispatched events**, not real uncaught exceptions:
  constructing `new ErrorEvent(...)` and a manually-tagged `unhandledrejection` Event
  and dispatching them directly is the standard, deterministic way to unit-test a
  global listener — waiting for a real uncaught throw to propagate through the test
  runner's own event loop would be flaky and environment-dependent.

## Phase 3

- **Only `fetch` is intercepted, not XHR**: confirmed the Phase 0 deferral — XHR
  interception is a separate, more invasive patch (`XMLHttpRequest.prototype.open`/
  `send`) for marginal MVP value when most modern code (and any framework this SDK
  would sit under) uses `fetch`. Can be added later if a real host app needs it.
- **What counts as a "non-success" response**: `!response.ok`, i.e. any status outside
  200-299 (covers both 4xx and 5xx) — matches the Fetch API's own notion of success and
  needs no extra configuration.
- **Network failure vs. non-success response are both `type: "http"`**: rather than a
  separate event type, a rejected fetch (DNS failure, CORS, offline, etc.) is
  represented as the same `"http"` event with `request.statusCode` left `undefined` —
  there's no response to report a status from. Consumers of `CapturedEvent` can
  distinguish the two cases by checking whether `statusCode` is present.
- **No headers or bodies captured**: only `request.url`, `request.method`, and (when
  available) the response status code are recorded. Per the project's privacy
  guardrail, headers/bodies can carry auth tokens, cookies, or other sensitive values,
  and capturing them wasn't asked for.
- **Interceptor always returns/rethrows the original value unchanged**: the wrapped
  `fetch` never mutates the `Response` or swallows a rejection — capture is a side
  effect via `onCapture`, observed after the fact, so the host app's own `.then`/
  `.catch` chains see exactly what they would have without the SDK installed.
- **Install-once guard, module-level state**: mirrors the Phase 2 listener pattern
  (`installed` flag) rather than tracking/restoring the previous `fetch` — this SDK has
  no `destroy()`/uninstall API yet, so there's nothing to restore to.

## Phase 4

- **Anti-recursion guarantee**: `transport/send.ts` captures its own `fetch` reference
  at module-load time, before `capture/network.ts`'s `installFetchInterceptor()` has a
  chance to patch `window.fetch`. This means the transport's own outbound POSTs are
  never observed by the SDK's own network-error interceptor — a down/misconfigured
  endpoint produces one console warning per failed send, not an ever-growing chain of
  `"http"` capture events about its own telemetry failing to send.
- **No retry/batching/queueing**: one event captured → one fire-and-forget POST. A send
  failure is only logged; the event isn't held for retry (it remains queryable via the
  existing in-memory buffer, but nothing re-attempts delivery). Kept intentionally
  minimal per the project's guardrails; only revisit if delivery guarantees become a
  real requirement.
- **`keepalive: true`**: added so a transport request triggered right before/during page
  unload (a common moment for errors to occur) has a chance to actually complete,
  matching how most error-tracking SDKs send their final beacon.
- **No endpoint configured → no-op transport**: unchanged from Phase 1's config
  design — `endpoint` stays optional; events are still captured and buffered in memory,
  just never sent, if it's omitted.
- **Demo's endpoint is intentionally unreachable**: `/mini-sentry/collect` has no
  backend (that's Phase 7+, explicitly out of scope). The demo exists to prove the
  send/graceful-failure path, not to stand up a collector.
- **Fixed a Phase 3 demo bug found during re-verification**: the "Trigger Failed Fetch
  (404)" button's GET request was answered by Vite dev server's SPA history fallback
  (200, `index.html`) instead of a real 404, so that capture path was never actually
  exercised by manual testing. Switched to POST, which Vite correctly 404s for
  unmatched routes. See Phase 3 entry in `PROGRESS.md`.

## Phase 5

- **Shadow DOM, `mode: "open"`**: chosen over `"closed"` so the SDK's own test suite
  can assert on rendered toast content directly (`host.shadowRoot.querySelectorAll(...)`)
  without a workaround. The style-isolation goal this phase actually cares about (host
  page CSS never leaking in, notification CSS never leaking out) holds identically
  under `"open"` or `"closed"` — `"closed"` only additionally hides the shadow tree
  from the host page's *own* scripts, which isn't a stated requirement here.
- **One shared host, not one per toast**: a single `<div>` (Shadow DOM host) is
  appended to `document.body` once and reused; each notification only adds/removes a
  `.toast` element inside it. Keeps the light DOM footprint on the host page to exactly
  one element regardless of how many notifications have been shown.
- **Host uses `pointer-events: none`, toasts use `pointer-events: auto`**: so the
  fixed, full-viewport host `<div>` (needed to position toasts in a corner) never
  intercepts clicks meant for the host page underneath it — only the toast bubbles
  themselves (and their dismiss button) are actually clickable. Directly serves the
  "must never alter host app behavior" guardrail.
- **6-second auto-dismiss, cap of 3 visible toasts**: arbitrary but reasonable MVP
  defaults, not exposed as config (not asked for, and the brief doesn't call out timing
  as configurable). The cap exists so a page throwing errors in a loop can't turn into
  an ever-growing stack of DOM nodes.
- **Notification text is `type: message` only** — no stack trace, no request URL/method,
  no timestamp. Those live in the console log (Phase 2) and `getCapturedEvents()`; the
  toast is meant to be a glanceable "something happened" signal, not a debugging
  surface, and keeping it terse avoids ever needing to worry about overflow/wrapping of
  arbitrarily long stack traces in a small fixed-width box.
- **No opt-out config**: unlike `enabled` (which gates the whole SDK), there's no
  separate flag to disable just the notification UI. The brief's Definition of Done
  describes the notification as part of the MVP experience; add a flag later only if a
  concrete host app needs silent/headless capture.

## Phase 6

- **Bundle tool decision, revisited and kept**: Phase 0 flagged "revisit plain `tsc`
  vs. a bundler in Phase 6 if output format needs reconsidering." Kept plain `tsc`: the
  SDK has zero runtime dependencies, ships plain ESM, and a real consumer's own bundler
  already minifies/tree-shakes it (the demo's Vite build of SDK+app together is `8.32
  kB` / `3.37 kB` gzip). A UMD/IIFE `<script>`-tag build was never requested and
  nothing in this repo needs it; revisit only if direct `<script>`-tag consumption
  becomes an actual requirement.
- **Query-param scrubbing, not full URL/message redaction**: `scrubUrl()` only redacts
  query-string parameter *values* whose *name* matches a small pattern
  (token/secret/password/key/session/jwt/auth/credential). Deliberately not attempting
  to scan/redact arbitrary substrings of `message`/`stack`/URL path segments — that's a
  much harder problem (heavy false-positive risk, e.g. any English word containing
  "key") that a hackathon-scope SDK shouldn't attempt; a name-based query-param
  heuristic is precedented (most error trackers do exactly this) and low-risk.
- **Hash fragments intentionally not scrubbed**: an OAuth implicit-flow style
  `#access_token=...` fragment is common, but a page's hash can also just be a
  client-side route (`#/settings`); parsing it as a query string to redact could
  corrupt that route. Scoped scrubbing to query strings only, where "is this a
  key=value pair" is unambiguous.
- **Scrubbing changes a redacted relative URL to absolute**: `scrubUrl("/api/x?token=1")`
  returns an absolute URL (resolved against `location`) once it redacts something,
  because `URL.toString()` always serializes absolutely — but a URL with nothing to
  redact is returned as the exact original string, unchanged in both content and
  format. Accepted as a minor, redaction-only side effect rather than hand-rolling
  string-level query editing to preserve relative form.
- **`getRecordedEvents()` returns a copy, not the live array**: closes a latent gap
  where TypeScript's `readonly` modifier (compile-time only) let a caller mutate the
  SDK's actual internal event buffer. Shallow-copies on every call; negligible cost
  given the existing 50-item cap.
- **READMEs added at both repo root and `sdk/`**: root README is project-level
  (structure, dev setup, status); `sdk/README.md` is the package-level API/usage/
  privacy reference — split so a future `sdk/` package consumer doesn't need the whole
  monorepo's context, matching how the package is already structured as an independent
  workspace.

## Phase 7

- **API key transport gap, closed via an SDK amendment**: exploration found that
  `sdk/src/transport/send.ts` validated `config.apiKey` (Phase 1) but never actually
  put it anywhere in the outbound request — no header, no query param. Since Phase 7
  requires API-key auth on ingestion, this had to be fixed for the acceptance
  criteria ("SDK can successfully send events") to be true end-to-end. Confirmed with
  the user: added `Authorization: Bearer <apiKey>` to the existing `fetch` call,
  scoped and minimal (one new parameter, one new header, no other transport
  behavior changed). Treated as a Phase 4 amendment, not a rewrite — Phase 4's own
  `PROGRESS.md` entry is left historically accurate; this phase's entry documents the
  change.
- **ORM: Prisma**, chosen by the user for strong TypeScript types and built-in
  migrations over Drizzle or raw `pg`. **Pinned to 6.19.3**, not the `latest` dist-tag
  (which resolved to `8.0.0-rc.10`, a release candidate with a breaking change: schema
  files can no longer declare `datasource.url` directly, requiring a separate
  `prisma.config.ts` + adapter). Prisma 6 keeps the standard `url = env("DATABASE_URL")`
  schema pattern and a plain `new PrismaClient()` constructor — simpler, and matches
  the "keep it simple/predictable" mandate for this backend. Revisit the Prisma 7
  migration only if a real reason to upgrade appears.
- **Phase 7/8 schema boundary**: Phase 7 introduces exactly one Prisma model
  (`Project`: `id`, `name`, `apiKeyHash`, timestamps) — just enough to validate a real
  API key — and deliberately does **not** persist ingested events anywhere yet.
  Considered adding a lightweight "staging" events table now, but rejected: nothing in
  Phase 7's acceptance criteria requires a stored record (only a response), and a
  staging table would just be dead weight Phase 8 immediately replaces once its full
  `error_groups`/`error_events` schema and grouping logic exist. Phase 8 should treat
  `Project`'s current fields as additive-only, since the seeded dev project, the demo
  app, and `docs/API_EXAMPLES.md`'s curl samples all depend on this exact shape.
- **API keys stored hashed (SHA-256, unsalted)**, never raw — `lib/apiKey.ts`'s
  `hashApiKey()`. No salt/keyed hash: these are high-entropy random tokens, not
  low-entropy user passwords, so the usual salting rationale doesn't apply; a plain
  digest is sufficient and keeps lookup a simple unique-index query.
- **CORS: global env-var allowlist (`CORS_ALLOWED_ORIGINS`), not per-project** — CORS
  preflight (`OPTIONS`) fires before the browser sends the `Authorization` header, so
  there's no way to know *which project* is asking during preflight, only the
  `Origin`. Resolving that per-project now would mean either a DB lookup keyed only on
  origin (ambiguous — multiple projects could share an origin) or restructuring the
  handshake. A global allowlist is simple and correct for now; per-project origin
  registration is a natural Phase 10 extension, once there's an authenticated API for
  project owners to register their own site's origin. Never a blind `"*"` — enforced
  structurally in `resolveCorsHeaders()`, which only ever reflects a literal match.
- **Truncate overlong string fields, don't reject them**: `message`/`stack`/
  `browser.userAgent`/`request.url` are capped and truncated (with a suffix marker),
  not treated as validation failures — a verbose but otherwise legitimate error
  message (e.g. one embedding a large JSON blob) shouldn't cause the whole event to be
  dropped. The wire-level 32 KiB payload cap still bounds worst-case abuse; only
  structural/type validity (missing field, wrong type, bad enum, bad timestamp,
  `type:"http"` without `request`) is a hard `400 INVALID_EVENT`.
- **`request.url`/top-level `url` validated as non-empty strings, not well-formed
  URLs**: `sdk/src/core/scrub.ts`'s `scrubUrl()` returns its input completely
  unchanged whenever there's nothing to redact, which can legitimately be a relative
  path (e.g. a same-origin `fetch("/api/x")`) — the top-level `url` is always absolute
  (sourced from `location.href`), but `request.url` is not. Validating either as
  `z.string().url()` would incorrectly reject real, valid `"http"` events.
- **Centralized error handling** (`lib/errors.ts`'s `ApiError`/`jsonError()`): the
  route's top-level `try/catch` only ever produces the generic `INTERNAL_ERROR`
  response for anything that isn't a deliberately-thrown `ApiError` — the real error
  is `console.error`-logged server-side only. This is a structural guarantee (there is
  no code path where a caught error's own message reaches a response body), not a
  convention that has to be remembered per-handler.
- **Events accepted but not persisted**: a structured `console.log` (`projectId`,
  `eventId`, `type`, `receivedAt`) is Phase 7's only visibility into accepted events,
  deliberately excluding `message`/`stack`/`url` to avoid dumping arbitrary
  user-supplied content into server logs by default. Real storage arrives in Phase 8.
- **`agentRules: false`** in `backend/next.config.mjs`: Next.js 16 auto-generates its
  own `AGENTS.md`/`CLAUDE.md` inside the workspace on every `dev`/`build` run (verified
  live — it appeared, then reappeared after deletion, until this flag was set).
  Disabled because this repo already has a deliberate, hand-authored root `CLAUDE.md`
  with project-specific conventions; a framework-generated one inside `backend/` would
  be confusing noise, not a real project convention.
- **No browser tool available this session**: end-to-end verification of the SDK →
  backend round trip used `curl` with a matching `Origin` header (indistinguishable
  from a real browser request as far as the server's CORS logic is concerned) rather
  than an actual browser click-through. See `PROGRESS.md`'s Phase 7 Known Limitations.

## Phase 8

- **Fingerprint = hash(type + message [+ method+url for "http"])**: the SDK sends a
  raw stack *string*, not structured frames (a Phase 2 decision — no stack-frame
  parsing exists), so grouping can't key off "same top stack frame" the way a real
  error tracker does. Message-based grouping is the simplest thing that actually
  works. For `"http"` events specifically, `message` alone is too coarse — every
  failed request produces a generic string like `"HTTP 500 Internal Server Error"`
  (see `docs/API_EXAMPLES.md`), which would incorrectly merge unrelated endpoints into
  one group. Confirmed live: an identical error sent 3 times collapsed into one group
  with `occurrenceCount: 3`; a differently-endpointed `http` event correctly formed a
  separate group. Trade-off, documented as a real limitation: two textually-different
  messages for what a human would call "the same bug" (e.g. one embedding a dynamic
  id) will form separate groups.
- **Group upsert + event create in one Prisma `$transaction`**: guarantees a group's
  `occurrenceCount`/`lastSeenAt` can never advance without the corresponding
  `ErrorEvent` row actually being persisted (and vice versa) — no code path can leave
  the two out of sync, even under a mid-write failure.
- **`ErrorGroup.message` is the first occurrence's message, never updated**: matches
  Phase 11's expected "representative error information" (a stable title per group),
  rather than churning on every new occurrence.
- **Response contract unchanged**: `POST /api/v1/events`'s `eventId` in the JSON
  response is still the client-supplied id echoed back, not the database row id or the
  group id. Phase 8 is entirely a server-side/storage change — no API consumer
  (including the SDK) needs to change anything to benefit from it.
- **`os`/`metadata` columns added but never populated**: the user's own Phase 8 field
  list names both, but the current `CapturedEvent` wire contract has no `metadata`
  field, and this repo has an explicit prior decision (Phase 2) against parsing
  `os`/browser name out of the raw user-agent string. Storing `null` is honest about
  what wasn't captured; the columns exist so a future phase can populate them without
  a schema migration once there's real data to put there. Not "fake" functionality —
  documented explicitly as reserved/unpopulated in both `docs/API.md` and
  `PROGRESS.md`.
- **`ON DELETE CASCADE` from `Project` through `ErrorGroup`/`ErrorEvent`**: verified
  live via direct `psql` inserts/deletes (not just assumed from the Prisma schema) —
  deleting a project also removes its groups and events, avoiding orphaned rows. No
  soft-delete/archival was asked for.

## Deferred (future phases, not implemented now)

- XHR interception: only fetch is intercepted (see Phase 3 above) — the brief
  explicitly allows deferring XHR if it adds substantial complexity. Revisit if a real
  host app needs it.
- An API to read back persisted events/groups (Errors query/Dashboard API),
  authentication, project/API-key management, notifications, and final hardening
  (Phases 9–13): explicitly out of scope until instructed, one phase at a time.
- Per-project CORS origin allowlisting: deferred to Phase 10 (see Phase 7 above).
- Rate limiting on `/api/v1/events`: deferred to Phase 13 (hardening).
- Stack-frame-based (rather than message-based) error grouping: not attempted — the
  SDK doesn't capture structured frames, and adding that is a bigger change to the
  capture contract than this backend-only phase should make unilaterally.
