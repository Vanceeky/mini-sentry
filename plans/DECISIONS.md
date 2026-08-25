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

## Deferred (future phases, not implemented now)

- XHR interception: only fetch is intercepted (see Phase 3 above) — the brief
  explicitly allows deferring XHR if it adds substantial complexity. Revisit if a real
  host app needs it.
- Any backend/DB/dashboard/auth/deployment/publishing work (Phases 7–13): explicitly
  out of scope until instructed.
