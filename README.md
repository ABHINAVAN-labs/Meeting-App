# Meeting App

A Next.js meeting app with a staged join flow and LiveKit-powered real-time audio/video rooms.

## Current Status

Implemented:
- Multi-page meeting flow:
  - `/` intro page
  - `/landing` meeting access page
  - `/:meetingCode` lobby / ready-check
  - `/:meetingCode/room` live meeting room
- Role model:
  - one active `teacher` per meeting
  - multiple `student` participants
- Real-time media:
  - LiveKit token-based room connect
  - local camera/mic publish
  - remote video and remote audio subscribe
- Tab-safe identity handling:
  - tab-scoped participant identity using `sessionStorage`
  - avoids same-browser-tab session collision issues
- Improved room stability:
  - graceful fallback when camera/mic device is unavailable
  - reconnect-aware UI state
  - suppression of known benign LiveKit dev-noise logs

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- React 19
- LiveKit (`livekit-client`, `livekit-server-sdk`)

## App Flow

1. User opens `/` and clicks **Continue**.
2. On `/landing`, user selects role, enters name + meeting code/link.
3. User reaches `/:meetingCode` lobby, can test camera/mic and click **Ask to Join**.
4. On join success, user enters `/:meetingCode/room`.
5. Room connects to LiveKit and renders participant media.

## Project Structure

```txt
app/
  page.tsx                          # Intro page
  landing/page.tsx                  # Meeting access page
  [meetingCode]/page.tsx            # Lobby/ready-check
  [meetingCode]/room/page.tsx       # Live meeting room UI

  api/
    meetings/
      join/route.ts                 # Join meeting (role validation + session)
      [meetingCode]/
        token/route.ts              # LiveKit token issuance for participant
        leave/route.ts              # Leave meeting
        participants/route.ts       # Participant listing
        events/route.ts             # SSE events (legacy/transition path)
        signal/route.ts             # Signaling endpoint (legacy/transition path)

    debug/livekit/route.ts          # LiveKit config sanity check

lib/
  meetings/
    constants.ts
    types.ts
    validation.ts
    session.ts
    store.ts
    service.ts

  realtime/
    livekit.ts                      # LiveKit token + URL utilities
```

## Environment Variables

Create `.env.local` in project root:

```env
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=<your_api_key>
LIVEKIT_API_SECRET=<your_api_secret>
```

Notes:
- `LIVEKIT_URL` must use `wss://`.
- Keep `LIVEKIT_API_SECRET` private.
- If secrets were ever exposed, rotate them immediately in LiveKit Cloud.

## Getting Started

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Open:
- `http://localhost:3000`

## LiveKit Sanity Check

Before testing rooms, verify config:

- `GET /api/debug/livekit`

Expected:
- URL exists and starts with ws/wss
- key/secret found
- token generation succeeds

## Local Testing Matrix

Recommended for reliable testing:

1. Teacher in Chrome normal profile.
2. Student in Chrome incognito or different browser.
3. Join same meeting code.
4. Verify:
   - both see each other video
   - both hear each other audio
   - room status reflects live participant count

## Known Behaviors

- In dev mode, LiveKit/WebRTC may emit transient console noise during reconnects.
- App suppresses common benign messages where safe.
- If camera/mic device is unavailable, room can still connect in limited mode.

## Troubleshooting

### 1) `405` on `/api/meetings/:code/token`
- Route is `POST` only. Direct browser GET will return 405 by design.

### 2) `403` on token route
- Usually missing/invalid participant session for that meeting.
- Rejoin through `/landing` -> lobby -> **Ask to Join**.

### 3) LiveKit websocket `1006`
Most common causes:
- project URL and API key/secret mismatch
- blocked websocket network path (VPN/firewall/proxy)
- wrong URL scheme

Checklist:
- same LiveKit project for URL + key + secret
- URL starts with `wss://`
- retry from different network (e.g. hotspot)

### 4) No remote audio
- Ensure browser audio permissions are allowed.
- Confirm output device is correct.
- Remote audio tracks are attached automatically in room page.

## Security Notes

- Never commit `.env.local`.
- Rotate LiveKit secrets if shared in logs/messages.
- Treat debug endpoints as development tooling; restrict/remove for production.

## Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

## Next Improvements (Planned)

- Replace remaining legacy signaling paths with a single LiveKit-only path.
- Persistent room state backend (Redis/Postgres) instead of in-memory store.
- TURN/SFU quality tuning profiles for classroom scale.
- Better in-app diagnostics UI for media/network states.
