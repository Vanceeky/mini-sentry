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

## Phase 9

- **Bearer session tokens, not cookies**: the brief said "use a secure session/
  token strategy appropriate for the existing architecture... do not invent an
  insecure custom mechanism," without mandating cookies. This API serves a web
  landing/onboarding app, a web dashboard, *and* a native mobile app — cookies
  work naturally for the two web clients but are awkward for a mobile HTTP
  client, and would need `Access-Control-Allow-Credentials`/`SameSite`
  decisions that add real complexity for no benefit here. Reusing the exact
  `Authorization: Bearer <token>` shape already established for project API
  keys (Phase 7) means one consistent auth mechanism across the whole API
  surface, works identically for every client type, and needed zero new CORS
  behavior. Trade-off, accepted: no CSRF surface (there's nothing here for a
  browser to auto-attach), but also no `HttpOnly` protection — wherever the
  frontend chooses to store the token (memory, `localStorage`, secure native
  storage) determines its exposure to XSS. That storage choice belongs to the
  frontend teams building against this API, not to this backend.
- **DB-backed sessions, not JWT**: a `sessions` table (hashed token -> user,
  with `expiresAt`) was chosen over a signed/stateless JWT specifically so
  `POST /auth/logout` can *actually* invalidate a token immediately. A
  stateless JWT can't be revoked without a blocklist — which is a second
  stateful store achieving the same thing a sessions table already does, just
  with more moving parts. This project already has Postgres for everything
  else; a sessions table is the boring, predictable choice, not a JWT-signing-
  secret-rotation problem.
- **Session tokens hashed the same way as API keys (unsalted SHA-256)**: same
  rationale as Phase 7's `apiKeyHash` — a random 32-byte token is high-entropy,
  not a low-entropy user secret, so a plain digest is sufficient. Refactored
  the hashing logic into a shared `lib/hash.ts` (`sha256Hex()`) used by both,
  instead of duplicating the same three lines in two files.
- **Passwords hashed with Node's built-in `scrypt` (`node:crypto`), not
  bcrypt/argon2**: avoids a new dependency (no native bindings to compile,
  keeps the "minimal dependencies" ethos this project already follows for the
  SDK) while still being a deliberately slow, salted KDF appropriate for
  low-entropy user secrets — unlike the token hashing above. Random 16-byte
  salt per password, stored as `"<saltHex>:<derivedKeyHex>"`;
  `verifyPassword()` uses `timingSafeEqual` for the comparison itself.
- **Timing-attack mitigation on login**: an early return on "no user found"
  would make a request for an unregistered email measurably faster than one
  for a registered email with a wrong password (no scrypt computation run) —
  a real, well-known user-enumeration side channel. Login always calls
  `verifyPassword()`, falling back to a precomputed `DUMMY_PASSWORD_HASH` when
  no user matches, so both cases run the same expensive computation and
  return the identical `401 INVALID_CREDENTIALS` response either way.
- **Register does not auto-login**: the brief's own acceptance-criteria flow
  lists them as separate steps ("Register -> Login -> Receive authenticated
  session..."). Followed literally — `/register`'s response never includes a
  session token; a client must call `/login` next. Simpler, and matches what
  was actually specified rather than adding an implicit convenience nobody
  asked for.
- **Logout is idempotent on an unrecognized token, not on a missing header**:
  a token that's already expired/logged-out/never-existed still gets
  `200 {success:true}` from `/auth/logout` — the end state a caller cares
  about ("this token no longer grants access") is identical whether or not
  anything was actually deleted. A **missing** `Authorization` header is a
  different situation (the caller isn't even attempting to identify a
  session) and still gets `401 UNAUTHORIZED`, consistent with every other
  authenticated endpoint in this API.
- **No password reset flow**: the brief explicitly made this conditional
  ("implement only if it can be done safely and simply"). A real reset flow
  needs a way to actually deliver a reset link/code out-of-band (email, SMS),
  which this backend has no mechanism for — building "half" of password reset
  (generate a token, no way to deliver it) would be exactly the kind of fake/
  placeholder functionality the project guardrails prohibit. Left out
  entirely and documented as a known limitation rather than stubbed.
- **`PAYLOAD_TOO_LARGE()`/`METHOD_NOT_ALLOWED()` generalized to take an
  optional parameter**: Phase 7 hardcoded the events-endpoint's 32 KiB limit
  and "POST" into these error factories. Auth endpoints need a different byte
  limit (4 KiB) and, for `/auth/me`, a different allowed method ("GET"). Both
  factories now default to the original Phase 7 values when called with no
  argument, so `events/route.ts` didn't need to change at all — purely
  additive.

## Phase 10

- **`Project.ownerId`/`apiKeyLastFour` are nullable, not required**: the
  Phase 7 seed project predates `User` (which didn't exist until Phase 9).
  Adding a NOT NULL `ownerId` to an existing table with existing rows would
  require either an interactive `prisma migrate dev` data-loss prompt (not
  viable in a non-interactive session) or a hand-written backfill migration —
  real complexity for zero benefit on what's just a dev fixture. Nullable at
  the schema level costs nothing in practice: every query that matters
  filters `WHERE ownerId = <user>`, and SQL's `= NULL` never matches, so a
  null-owner row is simply invisible through every Phase 10 endpoint —
  exactly the right behavior for a system fixture that isn't "owned" by
  anyone. `createProject()` always sets both fields; only pre-Phase-10 rows
  can ever be null.
- **Ownership scoping happens in the query itself, not "fetch then compare in
  JS"**: every read/write in `lib/project.ts` filters
  `where: { id: projectId, ownerId }` directly — `findFirst`/`updateMany`/
  `deleteMany` all return nothing for a project that exists but belongs to
  someone else, identically to one that doesn't exist. This is the actual
  IDOR defense the brief asked for ("never allow User A -> Project B through
  a manipulated project ID"), not just an application-level `if` a future
  refactor could accidentally drop.
- **`404 PROJECT_NOT_FOUND`, never `403 Forbidden`, for another user's
  project**: a `403` would itself leak information — it confirms the id
  refers to a *real* project, just not one the caller owns, letting an
  attacker enumerate valid project ids by status code alone. `404` is
  identical whether the id is real-but-not-yours or entirely made up.
  Verified live with two real accounts (see PROGRESS.md).
- **Only `POST .../api-key/rotate`, no standalone `POST .../api-key`**: the
  brief listed both as conditional ("if required by the existing
  architecture"). Since `POST /api/v1/projects` already issues a key
  atomically at creation, a project is never in a state of "exists but has no
  key" — there's no scenario a separate creation endpoint would actually
  serve. Building it anyway would be exactly the kind of endpoint the brief's
  own "do not blindly implement every endpoint" guidance warns against.
- **Key rotation is immediate and unconditional, no grace period**: the new
  key is generated, the old one's hash is overwritten in the same
  `updateMany`, and the response returns immediately — there's no window
  where both keys validate. Simpler than a dual-key/grace-period design, and
  matches the brief's "boring, predictable" mandate; a live deployment
  mid-rotation will see a hard cutover, documented as a known limitation
  rather than silently glossed over.
- **`PATCH` only edits `name`**: the brief's own example only showed renaming
  (`{"name": "My Application"}`); no other mutable field exists on `Project`
  yet, so `updateProjectSchema` intentionally has exactly one field rather
  than a speculative partial-update shape for fields that don't exist.
- **Real test-authoring bug found and fixed**: an `ApiError` built from a
  module imported *before* a test's `vi.resetModules()` call fails
  `instanceof ApiError` inside code imported *after* that reset — different
  reset epochs mean different class object identities for what looks like
  "the same" TypeScript type. Silently downgrades an intended `401` test to
  an actual `500` response, which the test would still (wrongly) need to
  assert against to catch — easy to miss. Fixed across all three new route
  test files by dynamically re-importing `@/lib/errors` *inside* the
  post-reset `freshRoute()` helper. Worth remembering for any future test
  that mocks a rejection with a typed error class alongside
  `vi.resetModules()`.

## Phase 11

- **`endpoint`/`statusCode`/`environment` denormalized onto `ErrorGroup`,
  captured once at group creation**: the list endpoint needs to show these
  per group without a join/subquery on every list request, and Phase 8
  already established the precedent (`message`/`type` are first-occurrence
  representative values, not recomputed). Extending that same pattern to
  three more fields is consistent, not a new design; the trade-off (a group
  summary can go stale if, say, an endpoint's URL shape changes over time) is
  identical to the one already accepted and documented for `message` in
  Phase 8.
- **Group detail's `stack` comes from the most recent occurrence, not the
  first**: unlike the group-summary fields above (deliberately first-
  occurrence, for a stable title), a developer opening an error's detail
  view wants to see what it looks like *now* — the most recent stack is more
  actionable for current debugging than the historical first one. This is
  fetched independently of whichever `occurrences` page was requested, so
  paging through history never changes what "the current stack" shows.
- **`type=` filter values match this contract's real enum (`error`/
  `unhandledrejection`/`http`), not the brief's illustrative `"network"`**:
  the brief's own example used `?type=network`, but the SDK's actual
  `CapturedEventType` (established in Phase 2/3) has never had a `"network"`
  value — network failures are `"http"` events (with an absent
  `statusCode`). Matching the brief's illustrative value over the SDK's real
  contract would mean either lying about what the API accepts or silently
  accepting a value that matches nothing; using the real enum is what "the
  exact contract may change based on the existing codebase" (the brief's own
  words) calls for.
- **`activeGroups` = groups with an occurrence in the last 24 hours**: the
  brief's stats example listed `activeGroups` without defining "active." 24
  hours is a simple, common, and — importantly — *documented* choice (in
  `constants.ts`, `docs/API.md`, and here) rather than an undocumented magic
  number; a real product would likely make this configurable, but nothing in
  the brief asked for that.
- **`errors`/`events` in stats are all-time totals, not windowed**: only
  `activeGroups` is time-windowed; `errors` (distinct groups) and `events`
  (total occurrences) count everything the project has ever received. This
  reading was chosen because pairing an already-windowed `activeGroups`
  alongside an *also*-windowed `errors` would make the two numbers redundant
  (a subset relationship the brief's example doesn't suggest) — the more
  useful pairing is "everything, ever" vs. "what's currently active."
- **`GET /api/v1/projects/:projectId/errors/:errorGroupId`'s "group not found
  in this project" is `404 ERROR_GROUP_NOT_FOUND`, a new code distinct from
  `PROJECT_NOT_FOUND`**: the project itself is already confirmed owned by
  this point (that check happens first and returns `PROJECT_NOT_FOUND` on its
  own if it fails) — a *different* 404 for "the project's real, the group
  inside it isn't" gives a caller a genuinely different, actionable signal
  rather than conflating two different failure reasons under one code.
- **Query-param validation errors reject, never silently clamp**: an invalid
  `limit=9999` is a `400 VALIDATION_ERROR`, not silently capped to 100 —
  consistent with every other validated input in this API (auth/project
  bodies also reject rather than coerce out-of-range values). A caller
  should know its request didn't mean what it thought, not get a silently
  different result.
- **No mobile-specific duplicate endpoints**: the brief explicitly asked for
  this ("mobile app should use the same APIs... do NOT create mobile-specific
  duplicate endpoints unless absolutely necessary"). Nothing about these four
  endpoints is web-specific (no HTML, no session cookies, plain JSON over
  bearer auth) — there was no reason mobile would need anything different.

## Phase 12

- **`ConsoleNotificationService` logs instead of delivering**: this project
  has no Expo Push or Firebase Cloud Messaging credentials configured, and
  the brief's own scope for this phase is "prepare the backend for mobile
  notifications" — not "integrate a real push provider." Logging exactly
  what *would* be sent, to which device, honors the "no fake functionality
  presented as working" guardrail: it doesn't pretend delivery succeeded, it
  doesn't silently no-op, and it's fully swappable later — a real provider
  is a new class implementing the same `NotificationService` interface, with
  `getNotificationService()` as the one place that changes.
- **A device belongs to a user, not a project**: the brief's own device
  registration example associates a device with "the authenticated
  developer," and semantically a developer should hear about errors across
  *all* their projects on the same phone, not re-register per project.
- **`pushToken` is unique; registration upserts, not always-creates**: an app
  reinstall commonly re-issues the same underlying push token, and a device
  can change hands to a different account. Upserting on the token means
  re-registration is idempotent (no accumulating duplicate rows for the same
  physical device) and correctly reassigns ownership if a different user
  registers a token another user previously owned. `POST /api/v1/devices`
  returns `200`, not `201`, because of this — the request might not have
  created anything new.
- **No `GET /api/v1/devices`**: the brief listed only `POST` and `DELETE` for
  this phase. Following the precedent set in Phase 10's decision to skip a
  standalone `POST .../api-key` endpoint, a list endpoint that wasn't asked
  for isn't added just because it would be convenient — it can be added in
  Phase 13 (hardening/handoff) or later if a real consumer needs it.
- **At most one notification per event, chosen by a fixed priority order
  (`NEW_ERROR` > `SERIOUS_ERROR` > `REACTIVATED_ERROR`)**: the brief
  explicitly warns against sending a notification for every event and
  against building "a complex alerting engine." A simple, documented
  priority order — rather than, say, a configurable scoring/weighting system
  — satisfies "keep the MVP simple" directly. New-group is ranked highest
  because it's the most novel/actionable signal a developer can get; a
  serious repeat failure outranks a mere reactivation because active 5xx
  errors are more urgent than "this got quiet-then-loud again."
- **`wasInactive` reuses `ACTIVE_GROUP_WINDOW_MS` (24h), the same constant
  Phase 11 defined for `activeGroups`**: "previously inactive" and "not
  currently active" are the same underlying concept — introducing a second,
  differently-tuned window for notifications specifically would be an
  unexplained inconsistency between two closely related features, not a
  deliberate design choice.
- **`persistEvent()` reads the existing group before upserting it**: the
  upsert's own return value only ever reflects the *post-write* state, so
  "was this a new group" / "was it inactive before this write" can't be
  recovered from it after the fact — an explicit `findUnique` first, inside
  the same transaction, is the only way to know the *prior* state
  authoritatively.
- **Notification failures are caught at the route, not inside
  `notifyIfNeeded()` itself**: `notifyIfNeeded()` lets errors propagate
  (keeping it simple/testable — a caller can assert on failures directly),
  while `events/route.ts` wraps the call in `try/catch` after `persistEvent`
  has already committed. This keeps the "is notification best-effort"
  *policy* decision at the one call site that actually needs to make it,
  rather than baking "swallow errors" into the library function itself
  (which would make failures invisible to anything else that might call it
  differently in the future, e.g. a batch reprocessing job).
- **`AuthenticatedProject` gained `ownerId`**: the events route needs to know
  who owns the project it just persisted an event for, to know who to
  notify — extending the existing `findProjectByApiKey()` select was simpler
  than a second query, and `ownerId` was already a real (if sometimes null)
  column on `Project` since Phase 10.

## Phase 13

- **A real, confirmed bug was found and fixed**: an independent audit (a
  fresh agent instructed to actually read every route/lib file against the
  hardening checklist, not just summarize expectations) found that
  `lib/cors.ts`'s `resolveCorsHeaders()` hardcoded
  `Access-Control-Allow-Methods: "POST, OPTIONS"` for **every** route,
  regardless of that route's real methods. This would have silently broken
  real browser preflight for every GET/PATCH/DELETE endpoint the moment a
  real dashboard tried to call them cross-origin — `GET /api/v1/auth/me`,
  `GET /api/v1/projects`, `PATCH`/`DELETE /api/v1/projects/:id`, all four
  dashboard query endpoints, and `DELETE /api/v1/devices/:id`. It also
  directly contradicted `docs/API.md`'s own CORS section, which claimed the
  header reflects "the endpoint's method + OPTIONS" — a claim that was false
  against the actual code. Fixed by adding an `allowedMethods` parameter to
  `resolveCorsHeaders()`, threaded through every route from a local
  `ALLOWED_METHODS` constant (the same string already used in that route's
  `METHOD_NOT_ALLOWED(...)` calls, so there's one source of truth per route,
  not two that could drift). Verified live via real `OPTIONS` preflight
  requests against every affected route (see `plans/PROGRESS.md`) and locked
  in with new regression tests asserting the exact `Access-Control-Allow-
  Methods` value per route shape (GET-only, GET+POST, GET+PATCH+DELETE,
  DELETE-only). This is exactly the kind of finding "fix only real issues"
  hardening is for — confirmed via live testing, not theoretical.
- **A second, lower-severity finding was fixed for consistency**: every
  `405 METHOD_NOT_ALLOWED` response was missing CORS headers entirely (the
  stub handlers took no `request` parameter). Harmless on its own (a
  disallowed method wouldn't have worked anyway), but inconsistent with "CORS
  applies to every endpoint," and a one-line-per-handler fix — addressed
  across every route alongside the primary fix above.
- **Everything else the audit checked came back clean** — auth coverage,
  hashing, secret-leakage-in-responses, IDOR/ownership scoping, payload size
  checks, malformed-input handling, DB foreign keys/indexes, N+1 queries,
  response-shape consistency, status-code consistency, error-code naming,
  and unsafe-metadata acceptance were all independently re-verified and
  found already correct — not re-litigated or "fixed" for the sake of
  activity. See `plans/PROGRESS.md` for the full audit summary.
- **Rate limiting: simple in-memory fixed-window, not Redis** — the brief's
  own guardrails rule out introducing new infrastructure ("no
  Redis/Kafka/queues"), and "rate limiting if simple enough" is explicitly
  conditional. A module-level `Map` with a periodic sweep (`lib/rateLimit.ts`)
  is genuinely simple, needs no new dependency, and is correct for this
  project's single-process deployment — documented explicitly as *not*
  correct for a horizontally-scaled multi-instance deployment (which would
  need a shared store), rather than silently glossed over.
- **Login rate-limited by email, events rate-limited by project id — never by
  raw/unvalidated input**: keying by an attacker-controlled value with no
  bound (e.g. the raw bearer token before validating it's real) would let an
  attacker grow the in-memory store with arbitrary garbage keys — a
  resource-exhaustion vector introduced by the mitigation itself. Login keys
  on the already-zod-validated email (bounded by "syntactically valid
  email-shaped strings," not arbitrary bytes); events keys on `project.id`,
  computed only *after* the API key has already been validated against a
  real project — so only requests that already passed authentication ever
  consume a rate-limit bucket.
- **Fixed-window, not sliding-window or token-bucket**: simpler to reason
  about and implement (no per-request timestamp history), at the cost of
  allowing up to ~2x the nominal limit across a window boundary in the worst
  case. Acceptable for abuse *prevention* (this is not a billing-accuracy
  system) — a real production deployment with stricter needs would use a
  sliding window or token bucket, deliberately not built here per "keep it
  simple."
- **`docs/API.md` reorganized into the brief's exact requested section
  order** (Authentication / Projects / API Keys / Event Ingestion / Errors /
  Stats / Devices / Notifications) — previously organized by phase-build
  order instead. Content was preserved verbatim where possible; only
  structure and a few cross-references changed. The generic error-shape/
  codes table was renamed from "Errors" to "Error Responses" to avoid
  colliding with "Errors" as the brief's name for the error-query endpoint
  category — two different things that happened to share a name.
- **`docs/FRONTEND_HANDOFF.md` is a new, separate document from
  `docs/API.md`**, not a duplicate — `API.md` is the field-by-field
  reference (organized by resource), `FRONTEND_HANDOFF.md` is the
  sequential "what do I actually do, in order" guide the brief explicitly
  asked for (11 specific numbered points), aimed at a developer joining one
  of the three frontend teams who hasn't read the reference doc yet.
- **One comprehensive, literal end-to-end integration test was added**
  (`e2e.integration.test.ts`) matching the brief's exact requested flow —
  Register -> Login -> Create Project -> Receive API Key -> Send SDK Event ->
  Persist Event -> Group Event -> Query Error -> Query Stats, plus a
  separate Mobile flow (Authenticate -> Get Projects -> Get Errors -> Get
  Error Detail) reusing the identical route handlers to prove there's no
  mobile-specific duplication. This exists *alongside* the narrower,
  phase-specific integration suites already in the repo (auth/flow,
  projects/flow, dashboard, devices/flow) — not a replacement for them; it's
  the single canonical "does the whole system work together" proof the
  brief asked for by name, kept as one readable file rather than assembled
  from cross-references.

## Deferred (future phases, not implemented now)

- XHR interception: only fetch is intercepted (see Phase 3 above) — the brief
  explicitly allows deferring XHR if it adds substantial complexity. Revisit if a real
  host app needs it.
- Real push provider integration (Expo Push, FCM): the `NotificationService`
  interface exists (Phase 12); no concrete provider is wired up.
- Redis-backed (or otherwise multi-instance-correct) rate limiting: today's
  in-memory limiter (Phase 13) only counts correctly within a single process.
- Sliding-window/token-bucket rate limiting: today's fixed-window limiter
  (Phase 13) allows up to ~2x the nominal limit across a window boundary.
- `GET /api/v1/devices` (list a user's registered devices): not asked for in
  Phase 12's brief, deferred until a real consumer needs it.
- Full-text/fuzzy search on error messages, or search across `stack`/`url`:
  today's `search` is a plain case-insensitive substring match on `message`
  only (Phase 11). Revisit if that stops being enough at real data scale.
- Configurable "active" window for `activeGroups` (currently a fixed 24h,
  Phase 11): no per-request override exists.
- Password reset: explicitly optional per the brief; deferred since this
  backend has no email/SMS delivery mechanism to build it safely (see Phase 9).
- "Log out everywhere" / multi-session management: only single-token logout
  exists; deferred until a real multi-device use case asks for it.
- Per-project CORS origin allowlisting: Phase 10 built the authenticated API a
  dashboard could build this on top of, but the origin-management UI/endpoint
  itself wasn't asked for and remains deferred.
- Key-rotation grace period (both old and new key valid briefly): deferred —
  rotation is immediate/unconditional today, see Phase 10 above.
- Pagination on `GET /api/v1/projects`: deferred until a developer's project
  count realistically needs it.
- Rate limiting on `/api/v1/events`: deferred to Phase 13 (hardening).
- Stack-frame-based (rather than message-based) error grouping: not attempted — the
  SDK doesn't capture structured frames, and adding that is a bigger change to the
  capture contract than this backend-only phase should make unilaterally.
