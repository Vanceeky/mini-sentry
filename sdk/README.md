# @vanceeq/canary

Framework-agnostic client-side error monitoring SDK. Zero runtime dependencies.

Published on npm — `npm install @vanceeq/canary`. (Inside this monorepo, still
consumed locally via the npm workspace — see the root `README.md`.)

## Usage

### npm / bundler

```ts
import { init, getCapturedEvents } from "@vanceeq/canary";

init({
  apiKey: "your_project_key",
});
```

Events are sent to the hosted Canary backend by default — no `endpoint`
needed. Pass one only if you're self-hosting the backend yourself (e.g. from
[`canary-backend`](https://github.com/Vanceeky/canary-backend)):

```ts
init({
  apiKey: "your_project_key",
  endpoint: "https://your-own-backend.example.com/api/v1/events",
});
```

### Script tag (no build step, no npm)

For a plain HTML page — including a legacy system with no build tooling — the
published package emits an IIFE bundle (`dist/canary.min.js`, exposes a `Canary`
global) that jsDelivr and unpkg mirror automatically, no self-hosting needed:

```html
<script src="https://cdn.jsdelivr.net/npm/@vanceeq/canary/dist/canary.min.js"></script>
<script>
  Canary.init({
    apiKey: "your_project_key",
  });
</script>
```
(`https://unpkg.com/@vanceeq/canary/dist/canary.min.js` works the same way, if
you'd rather not depend on jsDelivr specifically.)

Prefer not to depend on an external CDN? Self-host the same file instead —
`npm run build -w sdk` produces it locally too:

```bash
npm run build -w sdk
cp sdk/dist/canary.min.js /path/to/your-site/assets/js/
```
```html
<script src="/assets/js/canary.min.js"></script>
<script>Canary.init({ apiKey: "your_project_key", endpoint: "https://your-own-backend.example.com/api/v1/events" });</script>
```

`init()` never throws, even with an invalid config — a malformed call is logged as a
`console.warn` and leaves the SDK in a no-op state rather than affecting your app.

## Config

| Option     | Type    | Default                                             | Notes                                                          |
| ---------- | ------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `apiKey`   | string  | _required_                                           | must be a non-empty string                                       |
| `endpoint` | string  | the hosted Canary backend's `/api/v1/events`         | override only if self-hosting your own backend                  |
| `enabled`  | boolean | `true`                                               | `false` puts the SDK in no-op mode                               |

## What it captures

- Uncaught JS errors and unhandled promise rejections (via `window.addEventListener`,
  not by assigning `window.onerror` — so it composes with any handler your app already
  has, and never suppresses the browser's own console logging). JS errors also capture
  `filename`/`line`/`column` when the browser provides them, useful for locating a
  minified production stack trace.
- Non-2xx `fetch` responses and outright network failures (DNS/CORS/offline), via a
  `fetch` wrapper that always returns/rethrows exactly what your app would have
  gotten without the SDK installed.
- Failed resource loads — broken `<img src>`, `<script src>`, `<link href>` — via a
  capture-phase `error` listener, since these never go through `fetch()` and would
  otherwise be invisible to the network capture above. A status code is attached
  best-effort via the Resource Timing API when the browser/CORS setup allows it —
  never guessed when it's not available.

`XMLHttpRequest` is not intercepted — only `fetch`. Resource-load capture only covers
`img`/`script`/`link` — not `<audio>`/`<video>`/`<iframe>` or CSS-loaded assets like
`background-image`.

## What happens to a captured event

1. Buffered in memory (last 50), retrievable via `getCapturedEvents()`.
2. A small, auto-dismissing notification is shown (rendered into an isolated Shadow
   DOM host, so its styles can never leak into/out of your page).
3. POSTed to `endpoint` (the hosted Canary backend by default, or your own if
   overridden) as JSON, fire-and-forget — a down/misconfigured endpoint only
   logs a console warning, it never throws.

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
queueing, and no config option to disable just the notification UI.
