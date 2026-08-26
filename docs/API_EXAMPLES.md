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

# 3. Seed a dev project + print its API key
npm run db:seed -w backend
# -> Dev API key: mnst_dev_local_0000000000000000000000000000

# 4. Start the backend
npm run dev:backend
```

The examples below use the seeded dev key. It's a fixed, well-known,
local-only value — not a secret.

```bash
export API_KEY="mnst_dev_local_0000000000000000000000000000"
export BASE_URL="http://localhost:3000"
```

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
