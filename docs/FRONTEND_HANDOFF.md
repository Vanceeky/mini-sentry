# Frontend Handoff

You're building the landing/onboarding web app, the web dashboard, or the
mobile app against the Mini Sentry backend. This guide is the practical,
sequential path through integrating with it — the full field-by-field
reference lives in `docs/API.md`, and runnable curl examples for every case
live in `docs/API_EXAMPLES.md`. This document doesn't repeat those in full;
it explains the flow and points you at the right section.

You do not need database access, and you should never need to read backend
source code — if something here is unclear or the API doesn't behave as
documented, that's a bug in the API or this doc, not something to work
around.

```bash
export BASE_URL="http://localhost:3000"   # local dev; swap for your deployed URL
```

## 1. How to register

`POST /api/v1/auth/register` with `{ name, email, password }` creates a
developer account. It does **not** log the user in — there's no session
token in its response, only a safe user object (id/name/email/createdAt).

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/register" -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"correcthorsebattery"}'
```

A duplicate email returns `409 EMAIL_ALREADY_REGISTERED` — see `docs/API.md`'s
Authentication section for the full field constraints (password 8–200
chars, etc.) and every error case.

## 2. How to login

`POST /api/v1/auth/login` with `{ email, password }` returns a session
`token` **exactly once** in the response body — there is no cookie, no way
to retrieve it again if you lose it (you'd just log in again).

```bash
LOGIN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"correcthorsebattery"}')
TOKEN=$(echo "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
```

Store `token` however fits your platform (in-memory + refresh-on-reload for
a web app, secure native storage for mobile). Send it on every subsequent
authenticated request:

```
Authorization: Bearer <token>
```

It's valid for 30 days or until `POST /api/v1/auth/logout` is called with
it, whichever comes first. **Rate limited**: 10 attempts per email per
5-minute window — see "How to handle API errors" below for what a `429`
looks like and how to handle it gracefully (don't retry immediately; show
the user the wait time).

## 3. How to create a project

A "project" represents one app being monitored (e.g. one customer's web
app). `POST /api/v1/projects` with `{ name }`, authenticated with the
**session token** from step 2:

```bash
CREATE=$(curl -s -X POST "$BASE_URL/api/v1/projects" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Application"}')
```

`GET /api/v1/projects` lists everything the logged-in developer owns;
`GET`/`PATCH`/`DELETE /api/v1/projects/:projectId` read/rename/delete one.
Every one of these is scoped to the caller's own projects — see "How to
handle authentication" below for what happens with someone else's project
id.

## 4. How to obtain the SDK API key

The **same** `POST /api/v1/projects` response from step 3 includes `apiKey`
— the full, raw project API key, shown **exactly once**:

```json
{ "success": true, "project": { "id": "proj_...", "name": "My Application", "apiKeyLastFour": "a1b2", "apiKey": "mnst_..." } }
```

Show this to the developer immediately (this is the whole point of the
onboarding flow — "here's your key, put it in your app"). Every later read
of that project (`GET /api/v1/projects` or `GET /api/v1/projects/:id`) only
returns `apiKeyLastFour` (the last 4 characters) — the full key cannot be
retrieved again. If it's lost, the only recovery is
`POST /api/v1/projects/:projectId/api-key/rotate`, which issues a **new**
key and **immediately invalidates the old one** (no grace period — any app
still using the old key starts failing the instant this call returns).

## 5. How to install/configure the SDK

This is the `@mini-sentry/canary` package (in `sdk/` of this monorepo) — not
part of this backend's own API surface, but what the API key from step 4 is
for. In the customer's app:

```js
import { init } from "@mini-sentry/canary";

init({
  apiKey: "mnst_...",                          // from step 4
  endpoint: "https://your-backend.example.com/api/v1/events",
});
```

See `sdk/README.md` for the full config/privacy reference. Once
initialized, the SDK captures uncaught JS errors, unhandled promise
rejections, and failed/non-2xx `fetch` calls automatically — nothing else
to wire up on the customer's end.

## 6. How events reach the backend

```
SDK (customer's app) --POST /api/v1/events (project API key)--> backend
  --> validated --> persisted (Project -> ErrorGroup -> ErrorEvent)
  --> grouped by fingerprint (type + message [+ endpoint for http errors])
  --> may trigger a push notification (see point 9)
```

This is entirely the SDK's and backend's concern — neither the dashboard nor
the mobile app calls `POST /api/v1/events` directly; they only *read* what
it produced (points 7–8). Full field-by-field contract: `docs/API.md`'s
Event Ingestion section. Notable: events are rate limited to 100 per project
per 60-second window (point 11 covers handling the resulting `429`).

## 7. How the dashboard retrieves errors

Four read endpoints, all authenticated with the developer's **session
token** (never the project API key — that's for the SDK only), all scoped
to a specific project the caller owns:

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/projects/:projectId/errors` | Paginated, filterable list of error **groups** (the "list view") |
| `GET /api/v1/projects/:projectId/errors/:errorGroupId` | One group's full detail + paginated occurrences (the "detail view") |
| `GET /api/v1/projects/:projectId/events` | Flat, ungrouped raw event stream |
| `GET /api/v1/projects/:projectId/stats` | Summary numbers for overview cards |

```bash
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/errors?sort=lastSeen&limit=20" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/stats" -H "Authorization: Bearer $TOKEN"
```

Full query-param reference (search/type/status/environment/sort/pagination)
and response shapes: `docs/API.md`'s Errors and Stats sections.
`docs/API_EXAMPLES.md`'s "Dashboard queries" section has a complete runnable
walkthrough.

## 8. How mobile retrieves errors

**The exact same four endpoints as point 7.** There is no
mobile-specific API — the brief for this backend explicitly required this
("mobile app should use the same APIs... do NOT create mobile-specific
duplicate endpoints"), and it holds: authenticate with the same
`POST /api/v1/auth/login` flow (point 2), call the same
`GET /api/v1/projects/:projectId/errors` /
`GET /api/v1/projects/:projectId/errors/:errorGroupId` endpoints with the
same bearer session token. A mobile HTTP client doesn't get cookies, doesn't
need a different CORS story (CORS is a browser-only concern — a native
mobile client is entirely unaffected by it), and doesn't need a different
auth flow. If you find yourself wanting a mobile-only endpoint, that's a
signal to ask first — see `plans/DECISIONS.md`'s Phase 11 notes for why this
was deliberate.

## 9. How mobile notifications work

Two pieces: registering the device, and understanding what triggers a
notification.

**Register a device** (once per app install, and again if the push token
changes) — authenticated with the session token, same as any dashboard call:

```bash
curl -s -X POST "$BASE_URL/api/v1/devices" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"platform":"ios","pushToken":"<expo-or-fcm-token>"}'
```

Re-registering the same token is safe (it upserts) — call this on every app
launch if you want, it won't create duplicates. `DELETE /api/v1/devices/:deviceId`
removes one (e.g. on logout, if you want to stop notifying that device).

**What triggers a notification** — `POST /api/v1/events` (the SDK's own
call, not anything the mobile app does) may trigger **at most one**
notification per event: a brand-new error type appearing (`NEW_ERROR`), a
repeat serious server error (`SERIOUS_ERROR`, 5xx), or a previously-quiet
error coming back after 24+ hours (`REACTIVATED_ERROR`). Full trigger-rule
table and payload shape: `docs/API.md`'s Notifications section.

**Important caveat for this phase of the project**: no real push provider
(Expo Push, Firebase Cloud Messaging) is wired up yet — the backend logs
what it *would* send, server-side, rather than actually delivering a push.
If you're building the mobile app's notification-handling UI right now,
you'll need to either mock this locally or wait for a provider integration;
the `NotificationService` interface (`backend/src/lib/notification.ts`) is
designed so wiring one in later doesn't change this API's contract at all —
the payload shape and trigger rules documented here are already final.

## 10. How to handle authentication

- **Two separate token types, never interchangeable**: a project API key
  (from step 4, used only for `POST /api/v1/events`) and a user session
  token (from step 2, used for everything else). Sending the wrong one to
  an endpoint gets you `401 INVALID_API_KEY` or `401 INVALID_SESSION`
  respectively — not a silent failure.
- **Missing/malformed `Authorization` header** → `401 UNAUTHORIZED` (the
  header itself is absent, or not `Bearer <token>` shaped) — different from
  an unrecognized token (`401 INVALID_SESSION`/`INVALID_API_KEY`). Both mean
  "not authenticated," but if you're debugging, the code tells you which
  case you hit.
- **A project/error-group/device id that belongs to someone else (or
  doesn't exist)** always returns `404` (`PROJECT_NOT_FOUND` /
  `ERROR_GROUP_NOT_FOUND` / `DEVICE_NOT_FOUND`) — **never** `403`. This is
  deliberate: don't build UI logic that distinguishes "you don't have
  permission" from "this doesn't exist" based on status code, because this
  API intentionally doesn't let you tell the difference (a `403` would leak
  that the resource is real). If a request 404s, just show "not found" —
  don't say "access denied."
- **Session expiry**: a token simply stops working after 30 days (or after
  logout) — there's no refresh-token flow. When any authenticated call
  returns `401 INVALID_SESSION`, send the user back through login (step 2).

## 11. How to handle API errors

Every error response, on every endpoint, has the identical shape:

```json
{ "success": false, "error": { "code": "SOME_CODE", "message": "human-readable, safe to display" } }
```

`error.message` never contains a database error, a stack trace, or a
secret — it's always safe to log or show to a user. Build your error
handling against `error.code` (a stable string), not the message text
(which may be reworded).

**The one status code worth special handling**: `429 RATE_LIMITED` (on
login and event ingestion) always comes with a `Retry-After` header — the
number of seconds until the window resets. Read it and back off; don't
retry in a tight loop.

```bash
curl -s -i -X POST "$BASE_URL/api/v1/auth/login" -H "Content-Type: application/json" -d '...'
# HTTP/1.1 429 Too Many Requests
# retry-after: 287
# {"success":false,"error":{"code":"RATE_LIMITED","message":"Too many requests. Try again in 287 second(s)."}}
```

Full error-code reference table (every code, every HTTP status, which
endpoints produce it): `docs/API.md`'s Error Responses section, near the
top.

## CORS (web only)

If you're building the web landing/dashboard app, register your app's
origin with whoever runs this backend (it's the `CORS_ALLOWED_ORIGINS`
environment variable — comma-separated exact origins, not something you can
self-register via the API yet). An origin not on that list gets silently
blocked by the browser, not a clear API error — if your fetch calls are
failing with no response body at all and no 4xx/5xx in the Network tab,
this is almost always why. Mobile apps are entirely unaffected by this — CORS
is browser-only.

## Local dev quick-start

If you want to run this backend locally against your own frontend work:

```bash
docker compose -f backend/docker-compose.yml up -d   # or `docker-compose`, whichever your Docker install has
cp backend/.env.example backend/.env
npm run db:migrate -w backend
npm run db:seed -w backend      # prints a dev login + a dev project API key
npm run dev:backend             # http://localhost:3000
```

See `docs/API_EXAMPLES.md` for the full setup + every documented request/
response pair as runnable curl.
