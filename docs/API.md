# Mini Sentry API

REST API for the Mini Sentry backend. This is the contract the SDK, the web
dashboard, the landing/onboarding app, and the mobile app all consume — none of
those frontends need to read backend source code to integrate.

- **Base URL (local dev):** `http://localhost:3000`
- **Versioning:** all endpoints are prefixed `/api/v1`
- **Format:** JSON request/response bodies throughout

This document covers the complete backend built across Phases 7–15:
Authentication, Projects, API Keys, Event Ingestion, Errors, Stats, Devices,
Notifications, Project Members, Invitations, and Admin. Organized in that
order below.
See `docs/API_EXAMPLES.md` for runnable curl walkthroughs and
`docs/FRONTEND_HANDOFF.md` for an integration-focused guide aimed at the
landing/dashboard/mobile teams building against this API.

## Error Responses

Every error response, on every endpoint, uses the same shape:

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
| 400 | `VALIDATION_ERROR` | (Auth/Projects/Devices/Errors query params) Request body or query string isn't valid, or fails validation (missing field, malformed email, password too short/long, bad pagination value) |
| 401 | `UNAUTHORIZED` | `Authorization` header is missing or not `Bearer <token>` shaped |
| 401 | `INVALID_API_KEY` | The bearer token doesn't match any project |
| 401 | `INVALID_CREDENTIALS` | (Login only) Email or password is incorrect — deliberately the same message/code either way, so a response can't be used to check whether an email is registered |
| 401 | `INVALID_SESSION` | The bearer token doesn't match any active session (unknown, expired, or already logged out) |
| 404 | `PROJECT_NOT_FOUND` | (Project-scoped endpoints) No project with this id is accessible to the authenticated user (not the owner, and not a member of it) — identical whether the id doesn't exist at all or belongs to someone else |
| 404 | `ERROR_GROUP_NOT_FOUND` | (Error detail only) No error group with this id exists in the (already-confirmed-accessible) project |
| 404 | `DEVICE_NOT_FOUND` | (Device delete only) No device with this id is registered to the authenticated user — identical whether the id doesn't exist or belongs to someone else |
| 404 | `INVITATION_NOT_FOUND` | (Invitations) No pending invitation exists for this token — identical for an unknown, already-used, or revoked token |
| 404 | `INVITATION_EXPIRED` | (Invitation accept/preview only) The token was valid but its invitation has expired (7-day TTL) |
| 405 | `METHOD_NOT_ALLOWED` | Any HTTP verb other than the endpoint's documented method/`OPTIONS` |
| 400 | `NOT_A_PROJECT_MEMBER` | (Error assignment/member removal) The given user isn't a member of this project |
| 403 | `FORBIDDEN` | (Admin endpoints only) Authenticated, but not a `SUPERADMIN` |
| 403 | `INSUFFICIENT_ROLE` | (Project Members/Assignment) Authenticated and has project access, but the action requires being the project **owner** (or, for assignment, requires acting on yourself) |
| 403 | `INVITATION_EMAIL_MISMATCH` | (Invitation accept only) The token is valid, but wasn't addressed to the accepting account's email |
| 409 | `EMAIL_ALREADY_REGISTERED` | (Register only) An account with this email already exists |
| 409 | `INVITATION_ALREADY_PENDING` | (Invitation create only) A pending invitation already exists for this project + email |
| 409 | `CANNOT_REMOVE_OWNER` | (Member removal only) The project owner can't be removed as a member — there's always exactly one owner |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds the endpoint's size limit (32 KiB for events, 4 KiB for auth/projects/devices/members/invitations/assignment) |
| 429 | `RATE_LIMITED` | (Login, Event ingestion) Too many requests in the current window — a `Retry-After` header (seconds) is always attached |
| 500 | `INTERNAL_ERROR` | Unexpected server failure — message is always generic |

## Authentication

There are two independent bearer-token namespaces in this API — both use the
same `Authorization: Bearer <token>` header shape, but a token from one is
never valid against the other:

| | Project API key | User session token |
|---|---|---|
| Used by | The SDK, sending events from end-user browsers | The landing/onboarding app, dashboard, and mobile app, acting on behalf of a logged-in developer |
| Obtained via | `POST /api/v1/projects` (shown once) or `POST /api/v1/projects/:projectId/api-key/rotate` (shown once). The seed script also prints one fixed dev-only key. | `POST /api/v1/auth/login` |
| Identifies | A project (an app being monitored) | A user (a developer account) |
| Lifetime | Indefinite until rotated | 30 days, or until `POST /api/v1/auth/logout` |

```
Authorization: Bearer <apiKey-or-sessionToken>
```

There is no cookie-based session — the same bearer-token mechanism works
identically for a browser app and a native mobile client, so no platform
needs a different auth flow.

The flow: **Register -> Login -> receive a session token -> call authenticated
endpoints with it -> Logout**. Every endpoint below supports CORS the same way
as every other endpoint in this API (see the CORS section near the end) — no
cookies are set or read by this API.

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
{ "success": true, "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com", "role": "USER", "createdAt": "..." } }
```

`role` is `"USER"` unless the email is on the server's `SUPERADMIN_EMAILS`
allowlist (see the Admin section) — checked here and re-checked on every
login. The password is never returned or logged, in any form.

**Errors:** `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `POST /api/v1/auth/login`

**Authentication:** none

**Request body:** `{ "email": "...", "password": "..." }`

**Success response** — `200 OK`:

```json
{ "success": true, "token": "<opaque session token>", "user": { "id": "usr_...", "name": "...", "email": "...", "role": "USER" } }
```

`token` is shown exactly once — store it (the frontend's choice how: memory,
`localStorage`, secure native storage, etc.) and send it as
`Authorization: Bearer <token>` on subsequent requests. It's valid for 30
days or until logout, whichever comes first.

A wrong email *or* a wrong password both produce the identical
`401 INVALID_CREDENTIALS` response — this is deliberate, not an oversight, so
a caller can't use the error to determine whether a given email is
registered. See `plans/DECISIONS.md`.

**Rate limited** (Phase 13): at most 10 attempts per email per 5-minute
window; further attempts get `429 RATE_LIMITED` with a `Retry-After` header
(seconds) until the window resets.

**Errors:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `413 PAYLOAD_TOO_LARGE`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### `GET /api/v1/auth/me`

**Authentication:** required (`Authorization: Bearer <sessionToken>`)

**Success response** — `200 OK`:

```json
{ "success": true, "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com", "role": "USER" } }
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

## Projects

**Authentication:** every endpoint below requires a **user session token**
(`Authorization: Bearer <sessionToken>` from `/auth/login`) — never a project
API key. A project has exactly one **owner** (its creator) and, optionally
(Phase 15), directly-attached **members** — see the Project Members section
below. Only the owner can rename, delete, rotate the key, or invite/remove
members (this section and the endpoints below); a project's members only get
read access to error data and the ability to assign error groups to
themselves and set error status (see the Errors section's `PATCH` endpoint)
— being a member is not the same as co-ownership. Every endpoint below is
scoped to projects the authenticated user owns and returns
`404 PROJECT_NOT_FOUND` — not `403` — for a project id that either doesn't
exist or belongs to someone else. This is deliberate: a `403` would confirm
the id refers to a *real* project (just not yours); `404` reveals nothing.
See `plans/DECISIONS.md`.

None of these endpoints ever return a project's full API key **except**
creation and rotation (see the API Keys section below), and only in that one
response — every other response (list, get, update) includes
`apiKeyLastFour` (the last 4 characters) for identification only, never the
full key.

### `GET /api/v1/projects`

Lists every project the authenticated user can access — ones they own, plus
ones they've been invited into and joined as a member (unpaginated — a
developer's own accessible-project count is expected to be small; revisit if
that stops being true).

**Success response** — `200 OK`:

```json
{ "success": true, "projects": [{ "id": "proj_...", "name": "My Application", "apiKeyLastFour": "a1b2", "createdAt": "...", "updatedAt": "...", "isOwner": true }] }
```

`isOwner` distinguishes a project this user created from one they were
invited into.

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `500 INTERNAL_ERROR`.

### `POST /api/v1/projects`

Creates a project owned by the authenticated user and issues its API key.

**Request body:** `{ "name": "My Application" }`

**Success response** — `201 Created`:

```json
{ "success": true, "project": { "id": "proj_...", "name": "My Application", "apiKeyLastFour": "a1b2", "createdAt": "...", "updatedAt": "...", "apiKey": "mnst_..." } }
```

`apiKey` is the **full, raw** key — shown here and only here (also shown once
more on rotation, see API Keys below). Store it now; it cannot be retrieved
again, only rotated.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `GET /api/v1/projects/:projectId`

**Success response** — `200 OK`: `{ "success": true, "project": { "id", "name", "apiKeyLastFour", "createdAt", "updatedAt" } }` (no `apiKey`).

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `PATCH /api/v1/projects/:projectId`

Renames a project — `name` is the only editable field today.

**Request body:** `{ "name": "New Name" }`

**Success response** — `200 OK`: same shape as `GET` above, with the new name.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `DELETE /api/v1/projects/:projectId`

Deletes the project and **cascades** to all of its `ErrorGroup`/`ErrorEvent`
rows — irreversible, no confirmation step, no soft-delete/undo.

**Success response** — `200 OK`: `{ "success": true }`

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

## API Keys

Project API keys are managed as part of the Projects API above — creation
(`POST /api/v1/projects`) always issues one atomically, so there's no
separate "project with no key" state and no standalone "issue a first key"
endpoint. The only additional endpoint is rotation:

### `POST /api/v1/projects/:projectId/api-key/rotate`

**Authentication:** required (user session token, same ownership rules as Projects)

Issues a brand-new API key for the project and **immediately invalidates the
previous one** — no grace period, no overlap window. Any SDK still using the
old key starts getting `401 INVALID_API_KEY` on its very next event the
instant this call returns.

**Success response** — `200 OK`: `{ "success": true, "apiKey": "mnst_..." }` — the new raw key, shown once.

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

**Key lifecycle summary:** issued once at project creation -> shown in full
exactly once -> used by the SDK on every `POST /api/v1/events` -> optionally
rotated (old key dies immediately, new key shown once) -> implicitly retired
when the project is deleted. There is no way to view a full key after its
issuing response; only `apiKeyLastFour` remains visible afterward.

## Event Ingestion

### `POST /api/v1/events`

Accepts a single captured event from the SDK. Events are validated,
**persisted, and grouped** into a `Project -> ErrorGroup -> ErrorEvent` chain
in PostgreSQL — readable back via the Errors and Stats sections below.

Events are grouped by a fingerprint derived from `type` + `message` (plus
`request.method`+`request.url` for `"http"` events, since their `message` is
often a generic string like `"HTTP 500 Internal Server Error"` shared across
unrelated endpoints). Each group tracks `firstSeenAt`/`lastSeenAt` and an
`occurrenceCount` that increments on every matching event — a burst of the
same error becomes one group with a growing count, not one row per
occurrence.

**Authentication:** required (`Authorization: Bearer <apiKey>`, a project API key)

**Request body** — mirrors the SDK's `CapturedEvent` type exactly:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Client-generated event id, max 200 chars |
| `type` | `"error" \| "unhandledrejection" \| "http" \| "resource"` | yes | |
| `message` | string | yes | Truncated (not rejected) beyond 4096 chars |
| `stack` | string | no | Truncated beyond 20000 chars |
| `filename` | string | no | `type: "error"` only. Truncated beyond 2048 chars |
| `line` | number | no | `type: "error"` only. 1-indexed, must be positive |
| `column` | number | no | `type: "error"` only. 1-indexed, must be positive |
| `url` | string | yes | The page URL. **Not required to be a well-formed absolute URL.** |
| `timestamp` | string | yes | ISO-8601, e.g. `2026-08-26T10:30:00.000Z` — the client-side event time |
| `environment` | `"browser"` | yes | Fixed literal |
| `browser.userAgent` | string | yes | Truncated beyond 512 chars |
| `request` | object | only if `type === "http"` | `{ url, method, statusCode? }` |
| `request.url` | string | (within `request`) | Truncated beyond 2048 chars |
| `request.method` | string | (within `request`) | Truncated beyond 16 chars |
| `request.statusCode` | number | no | 100–599. Absent when the request failed outright (no response) |
| `resource` | object | only if `type === "resource"` | `{ url, tagName }` — a failed `<img>`/`<script>`/`<link>` load |
| `resource.url` | string | (within `resource`) | Truncated beyond 2048 chars |
| `resource.tagName` | `"img" \| "script" \| "link"` | (within `resource`) | Closed set — no other tags are captured |
| `resource.statusCode` | number | no | Best-effort (Resource Timing API) — often absent for cross-origin resources without a `Timing-Allow-Origin` response header, or on older browsers |

Unknown/extra fields (e.g. any future `metadata`) are silently stripped, never
stored or echoed back — there is no `metadata` field in the current contract.
Max total request body size: **32 KiB**.

**Success response** — `200 OK`:

```json
{ "success": true, "eventId": "evt_<id>" }
```

`eventId` is a deterministic echo of the client's `id` (prefixed `evt_`), not
a database-assigned identifier.

**Rate limited** (Phase 13): at most 100 events per project per 60-second
window; further events in the same window get `429 RATE_LIMITED` with a
`Retry-After` header. Keyed by project id (only a request with a real,
already-validated API key consumes a bucket).

**Side effect (Phase 12):** after persisting, this endpoint may trigger a
push notification to the project owner's registered devices — see
Notifications below. This is entirely best-effort: a notification failure is
logged server-side and never affects this endpoint's response — an event
that persisted successfully always returns `200`, whether or not a
notification fired.

**Error responses:** see Error Responses above; all apply to this endpoint.

## Errors

**Authentication:** every endpoint below requires a **user session token**,
scoped to a project the authenticated user can access — either as its owner,
or (Phase 15) as a direct member of it — the same `404 PROJECT_NOT_FOUND`
behavior as Projects either way. The web dashboard and the mobile app both
consume these exact same endpoints; there are no mobile-specific duplicates.

Every list endpoint returns the same pagination shape:

```json
"pagination": { "page": 1, "limit": 20, "total": 27 }
```

`page` defaults to 1, `limit` defaults to 20 (max 100) — invalid values
(non-numeric, `limit` over 100, `page` under 1) are a `400 VALIDATION_ERROR`,
not silently clamped.

### `GET /api/v1/projects/:projectId/errors`

Lists the project's error **groups** (not raw events).

**Query params:** `page`, `limit`, `search` (case-insensitive substring match
on `message`), `type` (`error` | `unhandledrejection` | `http` | `resource` —
note: this contract's SDK calls network failures `"http"`, not `"network"` as
an earlier illustrative draft of this endpoint suggested), `status` (exact
`statusCode` match, 100–599), `environment`, `sort` (`lastSeen` (default) |
`firstSeen` | `occurrences`, always descending).

**Success response** — `200 OK`:

```json
{
  "success": true,
  "data": [{ "id": "...", "message": "HTTP 500 Internal Server Error", "type": "http", "endpoint": "GET /api/users", "statusCode": 500, "occurrenceCount": 3, "firstSeenAt": "...", "lastSeenAt": "..." }],
  "pagination": { "page": 1, "limit": 20, "total": 2 }
}
```

`endpoint`/`statusCode` are `null` for non-`"http"` groups (a JS error has
neither). Every field is captured from the group's **first** occurrence, not
recomputed live — see the Event Ingestion section above and
`plans/DECISIONS.md`.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `GET /api/v1/projects/:projectId/errors/:errorGroupId`

**Query params:** `page`, `limit` — paginate the group's occurrences; there
is no way to fetch an unbounded occurrence list.

**Success response** — `200 OK`:

```json
{
  "success": true,
  "group": { "id": "...", "message": "...", "type": "http", "endpoint": "GET /api/users", "statusCode": 500, "environment": "browser", "firstSeenAt": "...", "lastSeenAt": "...", "occurrenceCount": 3, "stack": null, "filename": null, "line": null, "column": null },
  "occurrences": {
    "data": [{ "id": "...", "timestamp": "...", "browser": "...", "url": "...", "method": "GET", "statusCode": 500 }],
    "pagination": { "page": 1, "limit": 20, "total": 3 }
  }
}
```

`group.stack`, `group.filename`, `group.line`, and `group.column` all come
from the **most recent** occurrence (not the first) — "what does this error
look like right now" is what a developer debugging it actually wants; all
four are `null` for `"http"`/`"unhandledrejection"` events, or for an
`"error"` event whose browser didn't provide a source location.
`occurrences.data` is always ordered most-recent-first.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `404 ERROR_GROUP_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `PATCH /api/v1/projects/:projectId/errors/:errorGroupId`

Assigns/unassigns an error group to a project member, sets its `status`, or
both in one request (Phase 15).

**Request body** (at least one of `assigneeId`/`status` required):

```json
{ "assigneeId": "usr_...", "status": "IN_PROGRESS" }
```

- `assigneeId`: a member's user id, the project owner's id, or `null` to unassign.
- `status`: one of `"PENDING"`, `"IN_PROGRESS"`, `"DONE"`.

**Permissions:** `assigneeId` — the project **owner** may assign to (or
unassign) anyone accessible to the project (owner or member). A regular
member may only assign the group to themselves, or unassign themselves — not
touch another member's assignment. `status` — **any** project owner or
member may set it, regardless of who's assigned.

**Success response** — `200 OK`:

```json
{ "success": true, "group": { "id": "...", "message": "...", "assigneeId": "usr_...", "status": "IN_PROGRESS" } }
```

**Side effect:** on a successful non-null `assigneeId` change, this
best-effort notifies the assignee via the same notification mechanism as
Event Ingestion (see Notifications below) — a notification failure never
affects this endpoint's response. No notification fires on unassign or on a
`status`-only update.

**Errors:** `400 VALIDATION_ERROR`, `400 NOT_A_PROJECT_MEMBER` (the given `assigneeId` isn't a member of this project), `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `403 INSUFFICIENT_ROLE` (a non-owner member tried to assign someone other than themselves), `404 PROJECT_NOT_FOUND`, `404 ERROR_GROUP_NOT_FOUND`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `GET /api/v1/projects/:projectId/events`

A flat, ungrouped list of the project's raw ingested events, most recent
first — the "grouped" view is `/errors` above; this is the individual-event
view.

**Query params:** `page`, `limit`, `type` (optional filter).

**Success response** — `200 OK`:

```json
{
  "success": true,
  "data": [{ "id": "...", "groupId": "...", "type": "http", "message": "...", "url": "...", "method": "GET", "statusCode": 500, "timestamp": "...", "browser": "...", "environment": "browser", "createdAt": "..." }],
  "pagination": { "page": 1, "limit": 20, "total": 4 }
}
```

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

## Stats

### `GET /api/v1/projects/:projectId/stats`

**Authentication:** required (user session token, same ownership rules as Projects/Errors)

Overview numbers for a dashboard's summary cards.

**Success response** — `200 OK`:

```json
{ "success": true, "errors": 27, "events": 184, "lastErrorAt": "...", "activeGroups": 8 }
```

| Field | Meaning |
|---|---|
| `errors` | Total distinct error groups the project has ever had |
| `events` | Total individual occurrences ever ingested |
| `activeGroups` | Groups with at least one occurrence in the last 24 hours |
| `lastErrorAt` | The most recent `lastSeenAt` across all groups (`null` if none yet) |

"Active" (24 hours) is this backend's own definition, not dictated by any
contract — a reasonable, documented default; see `plans/DECISIONS.md`.

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

## Devices

**Authentication:** every endpoint below requires a **user session token** —
a device belongs to the developer, not any one project, since one developer
should hear about all of their projects' errors on the same device.

### `POST /api/v1/devices`

Registers (or re-registers) a push-notification target for the authenticated
user.

**Request body:** `{ "platform": "ios" | "android", "pushToken": "..." }`

**Success response** — `200 OK`:

```json
{ "success": true, "device": { "id": "...", "platform": "ios", "createdAt": "..." } }
```

`pushToken` is globally unique — registering a token that's already
registered **upserts** onto the existing row (reassigning it to the calling
user and the given platform) rather than creating a duplicate. This is what
makes re-registration after an app reinstall (which can re-issue the same
token) idempotent instead of accumulating stale rows. `200`, not `201`, for
exactly this reason: this request may not have created anything new.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `DELETE /api/v1/devices/:deviceId`

**Success response** — `200 OK`: `{ "success": true }`

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 DEVICE_NOT_FOUND`, `500 INTERNAL_ERROR`.

There's no `GET /api/v1/devices` (list) — the brief asked only for
register/delete; a list endpoint wasn't asked for and wasn't built. See
`plans/DECISIONS.md`.

## Notifications

Prepares the backend for mobile push notifications without actually
integrating a push provider yet — no Expo/Firebase credentials exist in
this project. There is no dedicated notifications *endpoint*; this section
documents the side effect `POST /api/v1/events` can trigger. The
architecture:

```
SDK -> POST /events -> persist event -> determine notification (if any) -> NotificationService -> (would push to) devices
```

**`NotificationService`** (`backend/src/lib/notification.ts`) is an
interface with one method, `notifyUser(userId, payload)`. Real delivery
(`FcmNotificationService`) sends via Firebase Cloud Messaging — used
whenever `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` is set (see
`.env.example`); a dead/uninstalled-app token (FCM's
`messaging/registration-token-not-registered`) is pruned from `Device`
automatically on send failure. Without that credential configured,
`ConsoleNotificationService` looks up the user's registered devices and
**logs** what would be sent to each instead — it does not call any real push
API. Either way, `getNotificationService()` is the only place that changes;
nothing in the event-ingestion path needs to.

**Trigger rules** — every event notifies, exactly **one** type per event,
chosen by priority:

| Trigger | Condition | Priority |
|---|---|---|
| `NEW_ERROR` | The event created a brand-new error group | 1st |
| `SERIOUS_ERROR` | A repeat `"http"` occurrence with `statusCode >= 500` | 2nd |
| `REACTIVATED_ERROR` | The group's previous occurrence was over 24h ago | 3rd |
| `ERROR_OCCURRED` | None of the above — an ordinary repeat occurrence | 4th (fallback) |

If more than one condition applies to the same event (e.g. a brand-new error
that's also a 5xx), only the highest-priority trigger fires — a new group is
always the most novel/actionable signal, so `NEW_ERROR` wins over
`SERIOUS_ERROR`, which in turn wins over `REACTIVATED_ERROR`, which wins over
the `ERROR_OCCURRED` fallback.

**Payload** (deep-links a mobile client to the specific error):

```json
{ "type": "NEW_ERROR", "projectId": "proj_...", "errorGroupId": "grp_...", "title": "New Error Detected", "message": "500 GET /api/users" }
```

`message` is `"<statusCode> <method> <url>"` for `"http"` events, or the
event's own `message` otherwise. Registering/removing the devices that
receive these notifications is documented under Devices above.

`ASSIGNED_ERROR` (Phase 14) is a fifth, separate trigger, fired only by the
error assignment endpoint (see the Errors section's `PATCH` endpoint above),
never by event ingestion — it doesn't compete with the four ingestion-time
triggers above and can fire alongside one of them on the same error group.

## Project Members

Phase 15: each project has members directly — there is no separate team to
create first. A project's **owner** (see Projects above, unchanged) is the
only privileged actor: they invite/remove members, rename/delete the
project, rotate its key. A member gets read access to the project's error
data and can assign/reassign themselves and set error status (see the
Errors section's `PATCH` endpoint) — only the owner can assign an error
group to someone other than themselves.

**Authentication:** every endpoint below requires a **user session token**.

### `GET /api/v1/projects/:projectId/members`

Lists the project's members — the owner (`isOwner: true`) followed by every
`ProjectMember`. Callable by the owner or any member.

**Success response** — `200 OK`: `{ "success": true, "members": [{ "userId", "name", "email", "createdAt", "isOwner" }] }`

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `DELETE /api/v1/projects/:projectId/members/:userId`

Removes a member. The owner can remove anyone; any member can remove
**themselves** ("leave project"). The owner cannot be removed or leave their
own project this way — there's always exactly one owner.

**Success response** — `200 OK`: `{ "success": true }`

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `403 INSUFFICIENT_ROLE` (a non-owner tried to remove someone else), `404 PROJECT_NOT_FOUND`, `400 NOT_A_PROJECT_MEMBER` (no such member), `409 CANNOT_REMOVE_OWNER`, `500 INTERNAL_ERROR`.

## Invitations

Phase 15: how someone joins a project. Invitations are per-project now (not
per-team). There is no guaranteed email-delivery mechanism in this backend
(the same reason password reset was deferred — see `plans/DECISIONS.md`),
so an invitation's raw token is always returned directly in the creation
response; this backend also attempts to actually email it via SMTP (see
`backend/src/lib/email.ts`) when `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
`SMTP_PASS`/`SMTP_FROM` are all configured (e.g. Gmail with an App
Password) — falling back to a logging-only placeholder otherwise. Either
way, **the token in the API response is the reliable way to deliver an
invite**, not a fallback.

A brand-new person (no account yet) can join in one step by registering
with the invite token — see `POST /api/v1/auth/register` below — rather
than needing to register first and then call the authenticated accept
endpoint separately.

### `GET /api/v1/projects/:projectId/invitations`

Lists the project's pending invitations. **Owner only.**

**Success response** — `200 OK`: `{ "success": true, "invitations": [{ "id", "projectId", "invitedEmail", "status", "expiresAt", "createdAt" }] }`

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `POST /api/v1/projects/:projectId/invitations`

Creates an invitation. **Owner only.** Rejects a duplicate pending
invitation for the same project + email.

**Request body:** `{ "email": "bob@example.com" }`

**Success response** — `201 Created`:

```json
{ "success": true, "invitation": { "id": "...", "invitedEmail": "bob@example.com", "status": "PENDING", "expiresAt": "..." }, "token": "<raw invite token>" }
```

`token` is shown **exactly once**, here — there is no way to retrieve it
again afterward. It expires after 7 days.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `409 INVITATION_ALREADY_PENDING`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### `DELETE /api/v1/projects/:projectId/invitations/:invitationId`

Revokes a pending invitation. **Owner only.**

**Success response** — `200 OK`: `{ "success": true }`

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `404 PROJECT_NOT_FOUND`, `404 INVITATION_NOT_FOUND`, `500 INTERNAL_ERROR`.

### `GET /api/v1/invitations/preview`

**PUBLIC — no authentication required.** Lets a brand-new person (no
account yet) preview what they've been invited to before registering.

**Query params:** `token` (required).

**Success response** — `200 OK`: `{ "success": true, "projectName": "...", "invitedEmail": "bob@example.com" }`

Never reveals anything beyond the project name and invited email, both
already implied by possessing the raw token.

**Errors:** `400 VALIDATION_ERROR`, `404 INVITATION_NOT_FOUND`, `404 INVITATION_EXPIRED`, `500 INTERNAL_ERROR`.

### `GET /api/v1/invitations/mine`

Lists pending invitations addressed to the authenticated user's own account
email — how an existing user discovers they've been invited somewhere,
without needing to already know a project id.

**Success response** — `200 OK`: same invitation shape as the project-scoped list above.

**Errors:** `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `500 INTERNAL_ERROR`.

### `POST /api/v1/invitations/accept`

Accepts an invitation and joins its project. For an authenticated caller who
**already has an account** — a brand-new person should register with the
token instead (see below). Idempotent if the caller is already a member
(marks the invitation `ACCEPTED` without creating a duplicate membership row).

**Request body:** `{ "token": "<raw invite token>" }`

**Success response** — `200 OK`: `{ "success": true, "projectId": "proj_..." }`

An unknown, already-used, or revoked token all produce the identical
`404 INVITATION_NOT_FOUND` — deliberately, so a caller can't use the response
to determine whether a guessed token was ever valid. A token that's expired
(and therefore lazily transitioned to `EXPIRED` on this very request) is the
one distinguishable case, `404 INVITATION_EXPIRED`, since the invitation did
genuinely exist. `403 INVITATION_EMAIL_MISMATCH` fires when the token is
valid but wasn't addressed to the accepting account's email — this doesn't
leak another user's data, only that *some* invitation exists for *some*
email, which the token itself already proves.

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `403 INVITATION_EMAIL_MISMATCH`, `404 INVITATION_NOT_FOUND`, `404 INVITATION_EXPIRED`, `413 PAYLOAD_TOO_LARGE`, `500 INTERNAL_ERROR`.

### Registering with an invite token

`POST /api/v1/auth/register` (see Authentication above) accepts an optional
`invitationToken` field. When present, the newly-created account
automatically joins that invitation's project in the same request — a
brand-new person never needs a separate authenticated "accept" call.

```json
{ "name": "Bob", "email": "bob@example.com", "password": "...", "invitationToken": "<raw invite token>" }
```

The response gains an `invitation` sub-field reporting the outcome:

```json
{ "success": true, "user": { ... }, "invitation": { "status": "accepted", "projectId": "proj_..." } }
```

**A bad, expired, or mismatched token never fails registration** — the
account is always created if the rest of the request is valid; only the
`invitation.status` reflects what happened (`"accepted"`, `"not_found"`,
`"expired"`, or `"email_mismatch"`). The `invitation` key is omitted
entirely when no `invitationToken` was sent.

## Admin

Phase 14 (updated Phase 15 for the Team→Project rename): read-only
oversight for a **superadmin** — a role granted only via the server's
`SUPERADMIN_EMAILS` environment variable (comma-separated emails),
re-checked (and promoted, if newly matching) on every login/register.
Promotion-only: removing an email from the allowlist does not demote an
already-promoted account. There is no endpoint to grant/revoke this role over
the API — it's an environment-level bootstrap, not a user-manageable
permission.

**Authentication:** every endpoint below requires a **user session token**
belonging to a `SUPERADMIN` account; anyone else gets `403 FORBIDDEN`.

### `GET /api/v1/admin/users`

Every registered user in the system, newest first.

**Query params:** `page`, `limit` (same pagination shape as Errors above).

**Success response** — `200 OK`: `{ "success": true, "data": [{ "id", "name", "email", "role", "createdAt" }], "pagination": { ... } }`

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

### `GET /api/v1/admin/projects`

Every project in the system ("your clients"), with owner info and member
count — distinct from `GET /api/v1/projects`, which only lists projects the
caller can access.

**Query params:** `page`, `limit`.

**Success response** — `200 OK`: `{ "success": true, "data": [{ "id", "name", "createdAt", "owner": { "id", "name", "email" } | null, "memberCount" }], "pagination": { ... } }`

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `401 INVALID_SESSION`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

## CORS

Two different CORS policies apply, depending on the endpoint:

**Every endpoint except `POST /api/v1/events`** supports CORS via **an
explicit allowlist of origins**, configured by the `CORS_ALLOWED_ORIGINS`
environment variable (comma-separated exact origins). It is never a
wildcard (`*`) here.

- An allowed origin gets `Access-Control-Allow-Origin` reflected back, plus
  `Access-Control-Allow-Methods` (the endpoint's method + `OPTIONS`) and
  `Access-Control-Allow-Headers: Content-Type, Authorization`.
- A disallowed or missing `Origin` gets **no** CORS headers on either the
  preflight (`OPTIONS`) or the actual response — the browser blocks the
  request client-side.
- This is the right policy for the landing page/dashboard's own origin(s) —
  known, stable domains you control.

**`POST /api/v1/events`** (and its `OPTIONS` preflight) is the one
exception: it always returns a **literal `Access-Control-Allow-Origin: "*"`**,
regardless of `CORS_ALLOWED_ORIGINS`. This is deliberate, not an oversight:
the SDK is meant to be embedded on arbitrary third-party websites (the whole
point of a client-side error-monitoring SDK, the same way Sentry/Rollbar's
own ingest endpoints work) — those domains can never be enumerated in
advance, so a fixed allowlist can't express "any site that installs the
SDK." This is safe specifically because this endpoint authenticates via a
project **API key** in the `Authorization` header, never a cookie — a page
on an arbitrary origin can't forge a request using a key it doesn't have,
so there's none of the CSRF-style risk that would come with opening a
cookie-authenticated endpoint this way.

Both policies share the rest of the same behavior:

- Non-browser callers (curl, server-to-server, the mobile app's HTTP client)
  are entirely unaffected by CORS — it's a browser-only enforcement
  mechanism.
- Because requests use a custom `Authorization` header and/or a JSON content
  type, every cross-origin `POST` triggers a real preflight `OPTIONS` request
  first. `GET /api/v1/auth/me` also supports `OPTIONS`, for consistency.
- No `Access-Control-Allow-Credentials` is ever sent — this API never uses
  cookies, only bearer tokens, so there's nothing credentialed for a browser
  to attach. This is also what makes a literal `"*"` valid for
  `/api/v1/events` per the CORS spec, without needing to reflect the
  caller's origin.

Per-project origin allowlisting for the allowlist-gated routes (letting a
project owner register their own site's origin) is a natural extension for
a future phase — not implemented yet, see Known Limitations.

## Rate Limiting

Two endpoints are rate limited (Phase 13) — see their sections above for
exact limits: `POST /api/v1/auth/login` (per email) and
`POST /api/v1/events` (per project). Both use a simple in-memory fixed-window
counter (`backend/src/lib/rateLimit.ts`) — no Redis or other new
infrastructure. This is correct for a single-process deployment; a
multi-instance deployment would need a shared store, since each process
would otherwise count independently. Exceeding a limit returns
`429 RATE_LIMITED` with a `Retry-After` header (seconds until the window
resets).

## Known limitations (Phases 7–14)

- `os` and `metadata` exist as columns in the database but are always `null`
  — the current SDK contract has no data for either (no user-agent parsing,
  no `metadata` field on `CapturedEvent`). They're reserved, not derived or
  faked.
- Resource-load-failure capture (`type: "resource"`) only covers `<img>`,
  `<script src>`, and `<link href>` — not `<audio>`/`<video>`/`<iframe>` or
  assets loaded via CSS (`background-image`, `@import`).
- CORS is a single global allowlist (env var), not per-project yet — applies
  to every endpoint except `POST /api/v1/events`, which is deliberately open
  to any origin (API-key authenticated, not cookie-authenticated — see the
  CORS section above).
- Rate limiting is in-memory and per-process (see Rate Limiting above) — not
  correct for a horizontally-scaled multi-instance deployment.
- No pagination on `GET /api/v1/projects` — fine while a developer's project
  count is small; revisit if that assumption stops holding.
- Rotating a project's API key is immediate and unconditional — no grace
  period where both the old and new key work, so a live deployment mid-swap
  will see a hard cutover, not a rollover window.
- Project deletion is immediate and irreversible (cascades to all of that
  project's error groups/events) — no confirmation step, soft-delete, or undo.
- Sessions don't support "log out everywhere" or a session list — only the
  exact token presented to `/auth/logout` is invalidated. Revisit if a real
  multi-device use case needs it.
- No password reset flow — the original Phase 9 spec made this optional
  ("implement only if it can be done safely and simply"); it needs an email
  delivery mechanism this backend doesn't have yet, so it was left out rather
  than half-built.
- **Error grouping is message-based, not stack-based** — two occurrences of
  "the same bug" with a textually different message (e.g. one embedding a
  dynamic id) form separate groups. `endpoint`/`statusCode`/`environment` on
  a group are captured once, from the first occurrence, and never updated —
  if an endpoint's URL pattern legitimately changes over time, old and new
  occurrences won't merge. See `plans/DECISIONS.md` (Phase 8 and 11).
- `GET /api/v1/projects/:projectId/errors`'s `search` is a plain
  case-insensitive substring match on `message` — no fuzzy matching, no
  search across `stack`/`url`, no full-text index.
- The SDK's outbound `fetch` doesn't explicitly set `credentials: "omit"` (a
  pre-existing minor discrepancy noted, not introduced, by Phase 7).
- **Real push delivery (FCM) is implemented but not yet live-verified**
  against a real Firebase project/device — see `plans/PROGRESS.md`'s
  Post-Phase-15 entry. Falls back to `ConsoleNotificationService` (logs
  exactly what would be sent) whenever `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`
  isn't configured.
- **No `GET /api/v1/devices`** — only register/delete exist, per the brief;
  there's no way to list a user's registered devices over the API today
  (inspect via `npm run db:studio -w backend` or `psql`).
- **REACTIVATED_ERROR reuses the same 24h window as `activeGroups`** — not
  independently configurable.
- **Exactly one notification per event, chosen by a fixed priority order**
  (`NEW_ERROR` > `SERIOUS_ERROR` > `REACTIVATED_ERROR` > `ERROR_OCCURRED`
  fallback) — not a scoring engine; a single event can never trigger more
  than one notification, but every event triggers one (by explicit user
  request — see `plans/DECISIONS.md`).
- **No cascading unassign when a member is removed from a project while
  still assigned to one of its error groups** — the (now stale) assignment
  is left in place rather than automatically cleared. Revisit if this causes
  confusion in practice.
- **Invitation uniqueness ("no duplicate pending invite per project+email")
  is enforced at the application layer, not a database constraint** —
  Postgres can only express "unique while status=PENDING" via a partial
  index, which isn't expressible in Prisma's schema DSL. A small race window
  exists under concurrent invitation creation, same class of trade-off as
  the in-memory rate limiter.
- **Invitation emails require SMTP configuration to actually deliver** — set
  all five of `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`
  (e.g. a Gmail account + App Password) to send real email; otherwise
  `sendInvitationEmail` just logs what would be sent. The raw token in the
  invitation-creation API response is always the reliable way to deliver an
  invite, whether or not SMTP is configured.
- **Superadmin role is snapshotted into the session token at login** — a role
  change (via editing `SUPERADMIN_EMAILS`) only takes effect on that user's
  *next* login, not live mid-session. There's no way to force-expire an
  existing session's cached role.
- **No endpoint to grant/revoke SUPERADMIN over the API** — it's bootstrapped
  purely via the `SUPERADMIN_EMAILS` environment variable, checked at
  login/register. Promotion-only: removing an email from the list doesn't
  demote an already-promoted account.
- **A project's members get access, not co-ownership** — members can read
  error data and manage assignment/status, but only the project's direct
  owner can rename/delete it, rotate its API key, or invite/remove members.

See `docs/API_EXAMPLES.md` for runnable curl examples and local setup steps,
and `docs/FRONTEND_HANDOFF.md` for an end-to-end integration guide.
