# API Examples

Runnable examples for `docs/API.md`. All examples assume the backend is
running locally per the setup below.

## Local setup

```bash
# 1. Start Postgres (dev/test only, port 5433)
docker compose -f backend/docker-compose.yml up -d

# 2. Copy env and apply the migration
cp backend/.env.example backend/.env
npm run db:migrate -w backend

# 3. Seed a dev user + a dev project (owned by that user) + print both
npm run db:seed -w backend
# -> Dev login: dev@example.com / mini-sentry-dev-password
# -> Dev API key: mnst_dev_local_0000000000000000000000000000

# 4. Start the backend
npm run dev:backend
```

The examples below use the seeded dev key/login. They're fixed, well-known,
local-only values — not secrets.

```bash
export API_KEY="mnst_dev_local_0000000000000000000000000000"
export BASE_URL="http://localhost:3000"
```

## Authentication flow

Register, log in, call an authenticated endpoint, then log out:

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/register" -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"correcthorsebattery"}'
```

```json
{ "success": true, "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com", "createdAt": "..." } }
```

```bash
LOGIN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"correcthorsebattery"}')
echo "$LOGIN"
TOKEN=$(echo "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
```

```json
{ "success": true, "token": "<opaque token>", "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com" } }
```

```bash
curl -s "$BASE_URL/api/v1/auth/me" -H "Authorization: Bearer $TOKEN"
```

```json
{ "success": true, "user": { "id": "usr_...", "name": "Ada Lovelace", "email": "ada@example.com" } }
```

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/logout" -H "Authorization: Bearer $TOKEN"
# {"success":true}

# The same token no longer works:
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/api/v1/auth/me" -H "Authorization: Bearer $TOKEN"
# {"success":false,"error":{"code":"INVALID_SESSION",...}}
# status: 401
```

## Error — duplicate registration

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/register" -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"correcthorsebattery"}'
```

```json
{ "success": false, "error": { "code": "EMAIL_ALREADY_REGISTERED", "message": "An account with this email already exists." } }
```

Status: `409`.

## Error — wrong login credentials

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"wrong-password"}'
```

```json
{ "success": false, "error": { "code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect." } }
```

Status: `401`. An unknown email produces the exact same response — see `docs/API.md`.

## Project management flow

Continuing with `$TOKEN` from the authentication flow above — create a
project, receive its API key, use it to send a real event, then manage the
project:

```bash
CREATE=$(curl -s -X POST "$BASE_URL/api/v1/projects" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Application"}')
echo "$CREATE"
PROJECT_ID=$(echo "$CREATE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["project"]["id"])')
PROJECT_API_KEY=$(echo "$CREATE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["project"]["apiKey"])')
```

```json
{ "success": true, "project": { "id": "proj_...", "name": "My Application", "apiKeyLastFour": "a1b2", "createdAt": "...", "updatedAt": "...", "apiKey": "mnst_..." } }
```

```bash
# Install SDK / start monitoring — the newly issued key works immediately:
curl -s -X POST "$BASE_URL/api/v1/events" -H "Authorization: Bearer $PROJECT_API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"evt_1","type":"error","message":"first error","url":"https://myapp.example.com/","timestamp":"2026-08-26T12:00:00.000Z","environment":"browser","browser":{"userAgent":"Mozilla/5.0 ..."}}'
# {"success":true,"eventId":"evt_evt_1"}

# List projects:
curl -s "$BASE_URL/api/v1/projects" -H "Authorization: Bearer $TOKEN"

# Rename it:
curl -s -X PATCH "$BASE_URL/api/v1/projects/$PROJECT_ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Renamed App"}'

# Rotate its API key (the old one stops working immediately):
curl -s -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/api-key/rotate" -H "Authorization: Bearer $TOKEN"
# {"success":true,"apiKey":"mnst_<new key>"}

# Delete it (cascades to any error groups/events):
curl -s -X DELETE "$BASE_URL/api/v1/projects/$PROJECT_ID" -H "Authorization: Bearer $TOKEN"
# {"success":true}
```

## Error — accessing another user's project (IDOR-safe)

A project id that's real but belongs to a *different* user returns the exact
same response as one that doesn't exist at all:

```bash
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/api/v1/projects/$PROJECT_ID" -H "Authorization: Bearer $SOMEONE_ELSES_TOKEN"
```

```json
{ "success": false, "error": { "code": "PROJECT_NOT_FOUND", "message": "No project with this id exists for the current user." } }
```

Status: `404` — never `403`. See `docs/API.md`.

## Success — `error` event

```bash
curl -s -X POST "$BASE_URL/api/v1/events" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_abc123",
    "type": "error",
    "message": "Failed to fetch user",
    "stack": "TypeError: Failed to fetch\n  at loadUser (app.js:42)",
    "url": "https://example.com/profile",
    "timestamp": "2026-08-26T10:30:00.000Z",
    "environment": "browser",
    "browser": { "userAgent": "Mozilla/5.0 ..." }
  }'
```

```json
{ "success": true, "eventId": "evt_evt_abc123" }
```

## Success — `http` event

```bash
curl -s -X POST "$BASE_URL/api/v1/events" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_def456",
    "type": "http",
    "message": "HTTP 500 Internal Server Error",
    "url": "https://example.com/profile",
    "timestamp": "2026-08-26T10:31:00.000Z",
    "environment": "browser",
    "browser": { "userAgent": "Mozilla/5.0 ..." },
    "request": { "url": "/api/users", "method": "GET", "statusCode": 500 }
  }'
```

```json
{ "success": true, "eventId": "evt_evt_def456" }
```

## Grouping in action

Sending the same `type`+`message` (and `request.method`+`request.url` for
`"http"` events) twice creates one `ErrorGroup` whose `occurrenceCount`
increments, not two separate groups:

```bash
curl -s -X POST "$BASE_URL/api/v1/events" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"evt_g1","type":"error","message":"Repeated error","url":"https://example.com/","timestamp":"2026-08-26T10:32:00.000Z","environment":"browser","browser":{"userAgent":"test"}}'

curl -s -X POST "$BASE_URL/api/v1/events" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"evt_g2","type":"error","message":"Repeated error","url":"https://example.com/","timestamp":"2026-08-26T10:33:00.000Z","environment":"browser","browser":{"userAgent":"test"}}'
```

Both return `200 {"success":true,...}`. There's no API yet to inspect the
resulting group/occurrence count directly (Phase 11) — for now, check via
`npm run db:studio -w backend` or `psql` against the local dev database.

## Error — missing Authorization header

```bash
curl -s -X POST "$BASE_URL/api/v1/events" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or malformed Authorization header. Expected \"Authorization: Bearer <apiKey>\"."
  }
}
```

Status: `401`.

## Error — invalid API key

```bash
curl -s -X POST "$BASE_URL/api/v1/events" \
  -H "Authorization: Bearer not-a-real-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_1", "type": "error", "message": "x",
    "url": "https://example.com/", "timestamp": "2026-08-26T10:30:00.000Z",
    "environment": "browser", "browser": { "userAgent": "test" }
  }'
```

```json
{ "success": false, "error": { "code": "INVALID_API_KEY", "message": "API key is invalid or unrecognized." } }
```

Status: `401`.

## Error — malformed JSON body

```bash
curl -s -X POST "$BASE_URL/api/v1/events" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{not valid json'
```

```json
{ "success": false, "error": { "code": "INVALID_EVENT", "message": "Request body must be valid JSON." } }
```

Status: `400`.

## Error — oversized body

```bash
curl -s -X POST "$BASE_URL/api/v1/events" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"evt_1\",\"type\":\"error\",\"message\":\"$(python3 -c 'print("x"*40000)')\",\"url\":\"https://example.com/\",\"timestamp\":\"2026-08-26T10:30:00.000Z\",\"environment\":\"browser\",\"browser\":{\"userAgent\":\"test\"}}"
```

```json
{
  "success": false,
  "error": { "code": "PAYLOAD_TOO_LARGE", "message": "Request body exceeds the maximum allowed size of 32768 bytes." }
}
```

Status: `413`.

## CORS preflight

```bash
curl -s -i -X OPTIONS "$BASE_URL/api/v1/events" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"
```

A `204` response with `Access-Control-Allow-Origin: http://localhost:5173` (and
the other CORS headers) if `http://localhost:5173` is listed in
`CORS_ALLOWED_ORIGINS`; no CORS headers otherwise.
