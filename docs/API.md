# Mini Sentry API

REST API for the Mini Sentry backend. This is the contract the SDK, the web
dashboard, the landing/onboarding app, and the mobile app all consume — none of
those frontends need to read backend source code to integrate.

- **Base URL (local dev):** `http://localhost:3000`
- **Versioning:** all endpoints are prefixed `/api/v1`
- **Format:** JSON request/response bodies throughout

This document currently covers **Phase 7 — Event Ingestion**, **Phase 8 —
Database & Event Persistence**, and **Phase 9 — Authentication**. Later
phases will add Projects, API Keys, an Errors query API, Stats, Devices, and
Notifications sections here as they're built — **there is still no way to
read ingested events back over the API** until Phase 11, and **no way for a
logged-in user to create/manage a project** until Phase 10.

## Authentication

There are two independent bearer-token namespaces in this API — both use the
same `Authorization: Bearer <token>` header shape, but a token from one is
never valid against the other:

| | Project API key | User session token |
|---|---|---|
| Used by | The SDK, sending events from end-user browsers | The landing/onboarding app, dashboard, and mobile app, acting on behalf of a logged-in developer |
| Obtained via | Today: the backend's seed script only (`npm run db:seed -w backend`, prints one fixed dev-only key). Phase 10 adds real issuance/rotation. | `POST /api/v1/auth/login` |
| Identifies | A project (an app being monitored) | A user (a developer account) |
| Lifetime | Indefinite until rotated (Phase 10) | 30 days, or until `POST /api/v1/auth/logout` |

```
Authorization: Bearer <apiKey-or-sessionToken>
```

There is no cookie-based session — the same bearer-token mechanism works
identically for a browser app and a native mobile client, so no platform
needs a different auth flow.

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
| 400 | `INVALID_EVENT` | (Event ingestion only) Request body isn't valid JSON, or fails validation (missing/wrong-type field, bad enum, bad timestamp, a `type: "http"` event without `request`) |
| 400 | `VALIDATION_ERROR` | (Auth endpoints) Request body isn't valid JSON, or fails validation (missing field, malformed email, password too short/long) |
| 401 | `UNAUTHORIZED` | `Authorization` header is missing or not `Bearer <token>` shaped |
| 401 | `INVALID_API_KEY` | The bearer token doesn't match any project |
| 401 | `INVALID_CREDENTIALS` | (Login only) Email or password is incorrect — deliberately the same message/code either way, so a response can't be used to check whether an email is registered |
| 401 | `INVALID_SESSION` | The bearer token doesn't match any active session (unknown, expired, or already logged out) |
| 405 | `METHOD_NOT_ALLOWED` | Any HTTP verb other than the endpoint's documented method/`OPTIONS` |
| 409 | `EMAIL_ALREADY_REGISTERED` | (Register only) An account with this email already exists |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds the endpoint's size limit (32 KiB for events, 4 KiB for auth) |
| 500 | `INTERNAL_ERROR` | Unexpected server failure — message is always generic |

## Authentication API

The flow: **Register -> Login -> receive a session token -> call authenticated
endpoints with it -> Logout**. All four endpoints support CORS the same way
as event ingestion (see the CORS section below) — no cookies are set or read
by this API.

### `POST /api/v1/auth/register`

Creates a developer account. Does **not** log the user in — call
`/auth/login` afterward to get a session token.

**Authentication:** none

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | 1–200 chars |
| `email` | string | yes | Valid email, max 320 chars. Lowercased/trimmed server-side. |
| `password` | string | yes | 8–200 chars |

**Success response** — `201 Created`:

```json
{ "success": true, "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com", "createdAt": "..." } }
```

The password is never returned or logged, in any form.

**Errors:** `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `POST /api/v1/auth/login`

**Authentication:** none

**Request body:** `{ "email": "...", "password": "..." }`

**Success response** — `200 OK`:

```json
{ "success": true, "token": "<opaque session token>", "user": { "id": "usr_...", "name": "...", "email": "..." } }
```

`token` is shown exactly once — store it (the frontend's choice how: memory,
`localStorage`, secure native storage, etc.) and send it as
`Authorization: Bearer <token>` on subsequent requests. It's valid for 30
days or until logout, whichever comes first.

A wrong email *or* a wrong password both produce the identical
`401 INVALID_CREDENTIALS` response — this is deliberate, not an oversight, so
a caller can't use the error to determine whether a given email is
registered. See `plans/DECISIONS.md`.

**Errors:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `GET /api/v1/auth/me`

**Authentication:** required (`Authorization: Bearer <sessionToken>`)

**Success response** — `200 OK`:

```json
{ "success": true, "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com" } }
```

Never includes a password hash.

**Errors:** `401 UNAUTHORIZED` (header missing/malformed), `401 INVALID_SESSION` (token unknown/expired), `500 INTERNAL_ERROR`.

### `POST /api/v1/auth/logout`

**Authentication:** required (`Authorization: Bearer <sessionToken>`)

Invalidates the session — the same token immediately stops working on
`/auth/me` and any future authenticated endpoint.

**Success response** — `200 OK`: `{ "success": true }`

Idempotent: logging out with a token that's already invalid/expired/logged-out
still returns `200`, not an error — the end state ("this token doesn't grant
access") is identical either way. A **missing** `Authorization` header is
still a `401 UNAUTHORIZED`, though — idempotency applies to the token being
unrecognized, not to skipping auth entirely.

**Errors:** `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`.

## Event Ingestion

### `POST /api/v1/events`

Accepts a single captured event from the SDK. As of Phase 8, events are
validated, **persisted, and grouped** into a `Project -> ErrorGroup ->
ErrorEvent` chain in PostgreSQL. There is no API to read this data back yet
(that's Phase 11's Error Query / Dashboard API) — this endpoint remains
write-only from a consumer's perspective.

Events are grouped by a fingerprint derived from `type` + `message` (plus
`request.method`+`request.url` for `"http"` events, since their `message` is
often a generic string like `"HTTP 500 Internal Server Error"` shared across
unrelated endpoints). Each group tracks `firstSeenAt`/`lastSeenAt` and an
`occurrenceCount` that increments on every matching event — a burst of the
same error becomes one group with a growing count, not one row per
occurrence.

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

## CORS

Applies to **every** endpoint in this API, not just event ingestion —
browsers call this API directly (the SDK from end-user pages, the
landing/dashboard apps from their own origins), so every route supports CORS
the same way, via **an explicit allowlist of origins** configured by the
`CORS_ALLOWED_ORIGINS` environment variable (comma-separated exact origins).
It is never a wildcard (`*`).

- An allowed origin gets `Access-Control-Allow-Origin` reflected back, plus
  `Access-Control-Allow-Methods` (the endpoint's method + `OPTIONS`) and
  `Access-Control-Allow-Headers: Content-Type, Authorization`.
- A disallowed or missing `Origin` gets **no** CORS headers on either the
  preflight (`OPTIONS`) or the actual response — the browser blocks the
  request client-side.
- Non-browser callers (curl, server-to-server, the mobile app's HTTP client)
  are entirely unaffected by CORS — it's a browser-only enforcement
  mechanism.
- Because requests use a custom `Authorization` header and/or a JSON content
  type, every cross-origin `POST` triggers a real preflight `OPTIONS` request
  first. `GET /api/v1/auth/me` also supports `OPTIONS`, for consistency.
- No `Access-Control-Allow-Credentials` is ever sent — this API never uses
  cookies, only bearer tokens, so there's nothing credentialed for a browser
  to attach.

Per-project origin allowlisting (letting a project owner register their own
site's origin) is a natural extension for Phase 10, once there's an
authenticated API to do it through.

## Known limitations (Phases 7–9)

- Events are persisted and grouped, but there is **no API to read them back**
  yet — that's Phase 11 (Error Query / Dashboard API).
- `os` and `metadata` exist as columns in the database but are always `null`
  — the current SDK contract has no data for either (no user-agent parsing,
  no `metadata` field on `CapturedEvent`). They're reserved, not derived or
  faked.
- CORS is a single global allowlist (env var), not per-project yet.
- No rate limiting yet (planned for Phase 13 hardening) — this applies
  especially to `/auth/login`, where brute-force protection would normally
  live.
- Sessions don't support "log out everywhere" or a session list — only the
  exact token presented to `/auth/logout` is invalidated. Revisit if a real
  multi-device use case needs it.
- No password reset flow — the original Phase 9 spec made this optional
  ("implement only if it can be done safely and simply"); it needs an email
  delivery mechanism this backend doesn't have yet, so it was left out rather
  than half-built.
- The SDK's outbound `fetch` doesn't explicitly set `credentials: "omit"` (a
  pre-existing minor discrepancy noted, not introduced, by Phase 7).

See `docs/API_EXAMPLES.md` for runnable curl examples and local setup steps.
