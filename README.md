# Meetigate Secure Meeting Identity

Meetigate now uses a secure, session-scoped participant identity model for meeting joins. Email and phone collection were removed from meeting entry.

## What Changed

- Join identity uses only `display_name`, `meeting_code`, and `role`.
- Participant IDs are generated as:
  - HMAC-SHA256 (truncated to 32 hex chars) over canonical payload with NULL-byte delimiter
  - UUIDv7 nonce suffix
  - final format: `<hmac32>-<uuidv7>`
- Rejoin uses ES256 JWT cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) with:
  - 300-second TTL
  - single-use nonce redemption
  - IP prefix + User-Agent hash binding
- Plaintext display names are not persisted in the participant repository.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Generate `SERVER_SECRET`:

```bash
npm run generate-secret
```

3. Add environment variables in `.env.local` from `.env.example`.

Required:
- `SERVER_SECRET` (>=64 hex chars)
- `REJOIN_TOKEN_PRIVATE_KEY_PEM`
- `REJOIN_TOKEN_PUBLIC_KEY_PEM`
- `ALLOWED_ORIGINS`
- LiveKit env values

## Create a Meeting

- Teacher bootstrap mode is enabled.
- The first valid teacher join for a new meeting code creates the in-memory meeting registry record.
- After that, role checks are server-authorized from the registry record.

## API Contracts

### `POST /api/meeting/join`

Request:

```json
{
  "display_name": "Rahul",
  "meeting_code": "MTG4821",
  "role": "student"
}
```

Success:

```json
{
  "participant_id": "<32char_hmac>-<uuidv7>",
  "meeting_code": "MTG4821",
  "role": "student",
  "expires_at": "<ISO8601>"
}
```

Failure:

```json
{
  "error": "join_failed",
  "code": "invalid_request|unauthorized|rate_limited"
}
```

### `POST /api/meeting/rejoin`

- Reads `rejoin_token` cookie
- Redeems single-use nonce
- Rotates nonce and sets a new cookie

### `DELETE /api/meeting/leave`

- Reads `rejoin_token` cookie
- Invalidates nonce
- Marks participant inactive until meeting expiry

## Existing Meeting Routes

Legacy `/api/meetings/*` routes remain active for current UI flow and now resolve participant context from the signed rejoin cookie path.

## Run Tests

```bash
npm test
```

Security tests cover:
- Participant ID format and uniqueness
- Role authorization enforcement
- Name validation and delimiter attack rejection
- Rejoin token single-use
- IP binding rejection
- Expired token rejection
- Participant cap enforcement
- Secret validation hard-fail
- Secret grep leakage check

## Production Checklist

- [ ] `SERVER_SECRET` rotated and not default
- [ ] Valid HTTPS certificate in production
- [ ] Redis backing for nonce and rate limiting stores
- [ ] Log pipeline configured and reviewed for PII leakage
- [ ] Meeting expiry purge job scheduled
- [ ] Security headers verified (for example with securityheaders.com)
