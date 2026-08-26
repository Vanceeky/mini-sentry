# Mini Sentry API

REST API for the Mini Sentry backend. This is the contract the SDK, the web
dashboard, the landing/onboarding app, and the mobile app all consume — none of
those frontends need to read backend source code to integrate.

- **Base URL (local dev):** `http://localhost:3000`
- **Versioning:** all endpoints are prefixed `/api/v1`
- **Format:** JSON request/response bodies throughout

This document currently covers **Phase 7 — Event Ingestion** only. Later
phases will add Authentication, Projects, API Keys, Errors, Stats, Devices,
and Notifications sections here as they're built.

## Authentication

`POST /api/v1/events` authenticates with a **project API key**, not a
developer session — the SDK sends events directly from end-user browsers, so
it can't use cookie/session auth.

```
Authorization: Bearer <apiKey>
```

Today the only way to obtain a project API key is the backend's seed script
(`npm run db:seed -w backend`), which prints one fixed dev-only key. Phase 10
(Project Management API) will add real key issuance/rotation for the
landing/onboarding app.

## Errors

Every error response uses the same shape:

```json
{ "success": false, "error": { "code": "INVALID_API_KEY", "message": "..." } }
```

`error.message` is always safe to display or log — it never contains a
database error, an internal stack trace, or a secret. Unexpected internal
failures always come back as `INTERNAL_ERROR` with a generic message; the real
cause is logged server-side only.

| HTTP status | code | meaning |
|---|---|---|
| 400 | `INVALID_EVENT` | Request body isn't valid JSON, or fails validation (missing/wrong-type field, bad enum, bad timestamp, a `type: "http"` event without `request`) |
| 401 | `UNAUTHORIZED` | `Authorization` header is missing or not `Bearer <token>` shaped |
| 401 | `INVALID_API_KEY` | The bearer token doesn't match any project |
| 405 | `METHOD_NOT_ALLOWED` | Any HTTP verb other than `POST`/`OPTIONS` |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds 32 KiB |
| 500 | `INTERNAL_ERROR` | Unexpected server failure — message is always generic |

## Event Ingestion

### `POST /api/v1/events`

Accepts a single captured event from the SDK. Events are validated and
acknowledged, but **not yet persisted to a queryable store** — that lands in
Phase 8 along with error grouping. See Known Limitations below.

**Authentication:** required (`Authorization: Bearer <apiKey>`)

**Request body** — mirrors the SDK's `CapturedEvent` type exactly:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Client-generated event id, max 200 chars |
| `type` | `"error" \| "unhandledrejection" \| "http"` | yes | |
| `message` | string | yes | Truncated (not rejected) beyond 4096 chars |
| `stack` | string | no | Truncated beyond 20000 chars |
| `url` | string | yes | The page URL. **Not required to be a well-formed absolute URL.** |
| `timestamp` | string | yes | ISO-8601, e.g. `2026-08-26T10:30:00.000Z` — the client-side event time |
| `environment` | `"browser"` | yes | Fixed literal |
| `browser.userAgent` | string | yes | Truncated beyond 512 chars |
| `request` | object | only if `type === "http"` | `{ url, method, statusCode? }` |
| `request.url` | string | (within `request`) | Truncated beyond 2048 chars |
| `request.method` | string | (within `request`) | Truncated beyond 16 chars |
| `request.statusCode` | number | no | 100–599. Absent when the request failed outright (no response) |

Unknown/extra fields (e.g. any future `metadata`) are silently stripped, never
stored or echoed back — there is no `metadata` field in the current contract.
Max total request body size: **32 KiB**.

**Success response** — `200 OK`:

```json
{ "success": true, "eventId": "evt_<id>" }
```

`eventId` is a deterministic echo of the client's `id` (prefixed `evt_`), not
a database-assigned identifier.

**Error responses:** see the Errors table above; all apply to this endpoint.

### CORS

Browsers send events to this endpoint directly from end-user pages, so it
supports CORS — but **only for an explicit allowlist of origins**, configured
via the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated exact
origins). It is never a wildcard (`*`).

- An allowed origin gets `Access-Control-Allow-Origin` reflected back, plus
  `Access-Control-Allow-Methods: POST, OPTIONS` and
  `Access-Control-Allow-Headers: Content-Type, Authorization`.
- A disallowed or missing `Origin` gets **no** CORS headers on either the
  preflight (`OPTIONS`) or the actual (`POST`) response — the browser blocks
  the request client-side.
- Non-browser callers (curl, server-to-server, the mobile app's HTTP client)
  are entirely unaffected by CORS — it's a browser-only enforcement
  mechanism.
- Because the request uses a custom `Authorization` header and a JSON content
  type, every cross-origin POST triggers a real preflight `OPTIONS` request
  first.

Per-project origin allowlisting (letting a project owner register their own
site's origin) is a natural extension for Phase 10, once there's an
authenticated API to do it through.

### Known limitations (Phase 7)

- Accepted events are validated and acknowledged, but not yet persisted to
  any queryable store or grouped — that's Phase 8.
- CORS is a single global allowlist (env var), not per-project yet.
- No rate limiting yet (planned for Phase 13 hardening).
- The SDK's outbound `fetch` doesn't explicitly set `credentials: "omit"` (a
  pre-existing minor discrepancy noted, not introduced, by this phase).

See `docs/API_EXAMPLES.md` for runnable curl examples and local setup steps.
