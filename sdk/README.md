# @mini-sentry/sdk

Framework-agnostic client-side error monitoring SDK. Zero runtime dependencies.

Not published to a registry — consumed locally via the npm workspace in this repo
(see the root `README.md`).

## Usage

```ts
import { init, getCapturedEvents } from "@mini-sentry/sdk";

init({
  apiKey: "your_project_key",
  endpoint: "https://your-collector.example.com/events", // optional
});
```

`init()` never throws, even with an invalid config — a malformed call is logged as a
`console.warn` and leaves the SDK in a no-op state rather than affecting your app.

## Config

| Option     | Type    | Default    | Notes                                                          |
| ---------- | ------- | ---------- | ---------------------------------------------------------------- |
| `apiKey`   | string  | _required_ | must be a non-empty string                                       |
| `endpoint` | string  | none       | if omitted, events are still captured/buffered, just never sent |
| `enabled`  | boolean | `true`     | `false` puts the SDK in no-op mode                               |

## What it captures

- Uncaught JS errors and unhandled promise rejections (via `window.addEventListener`,
  not by assigning `window.onerror` — so it composes with any handler your app already
  has, and never suppresses the browser's own console logging).
- Non-2xx `fetch` responses and outright network failures (DNS/CORS/offline), via a
  `fetch` wrapper that always returns/rethrows exactly what your app would have
  gotten without the SDK installed.

`XMLHttpRequest` is not intercepted — only `fetch`.

## What happens to a captured event

1. Buffered in memory (last 50), retrievable via `getCapturedEvents()`.
2. A small, auto-dismissing notification is shown (rendered into an isolated Shadow
   DOM host, so its styles can never leak into/out of your page).
3. If `endpoint` is configured, it's POSTed there as JSON, fire-and-forget — a
   down/misconfigured endpoint only logs a console warning, it never throws.

## Privacy

- Network capture only ever records method/URL/status — never request/response
  headers or bodies, since those can carry auth tokens, cookies, or other secrets.
- Any captured URL (page URL or request URL) has query-string parameters whose name
  looks like a credential (`token`, `secret`, `password`, `key`, `session`, `jwt`,
  `auth`, ...) redacted to `[Redacted]` before it's stored or sent.
- Nothing is read from cookies, request/response headers, or form fields.
- Error `message`/`stack` are captured verbatim. If your own code embeds sensitive
  data in an error message (e.g. `` throw new Error(`bad password: ${pw}`) ``), the SDK
  has no way to know that and will capture it as-is — avoid putting sensitive values in
  error messages you throw.
- A URL's hash fragment (e.g. an OAuth implicit-flow `#access_token=...`) is **not**
  scrubbed — only query-string parameters are. Parsing an arbitrary fragment as a
  query string risks corrupting a legitimate hash-based route.

## Safety guarantees

- Every public entry point is wrapped in an internal error boundary — an internal SDK
  bug can never throw into your app.
- The `Response`/rejection your app's own `fetch` calls see is never altered; the SDK
  only observes.
- The SDK's own outbound requests (to `endpoint`) are never themselves captured as
  network-error events, even if that endpoint is down — this SDK captures the fetch it
  patches, but sends its own telemetry through the original, unpatched fetch it
  captured a reference to at load time.

## Known limitations

See `plans/PROGRESS.md` and `plans/DECISIONS.md` at the repo root for the full,
phase-by-phase detail. In short: no XHR interception, no transport retry/batching/
queueing, no backend to actually receive events yet (that's explicitly out of scope
until a later phase), and no config option to disable just the notification UI.
