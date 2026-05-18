# Meetigate

Meetigate is a classroom-focused meeting app built with Next.js, LiveKit, Supabase-ready persistence, and a session-scoped participant identity model. It supports teacher-led rooms, student admission, role-aware media permissions, room chat, AI tutor chat, attendance, moderation, and a teacher-only whiteboard.

## Tech Stack

- Next.js App Router with React 19 and TypeScript
- LiveKit client/server SDK for realtime audio, video, and screen sharing
- Supabase service client for optional meeting persistence
- In-memory room store for local/default runtime state and realtime event fanout
- ES256 JWT rejoin cookies plus HMAC/UUIDv7 participant IDs
- OpenRouter-backed AI tutor chat
- Jest for security-focused backend tests

## Main User Flows

### Home and Entry

- `/` is the public Meetigate home page.
- `/landing` lets a user choose `student` or `teacher`, enter a name, and enter or generate a meeting code.
- `New link` generates a fresh teacher meeting code only. It does not enter the room.
- `Join` is the action that moves the user into the meeting flow.

### Lobby

- `/:meetingCode` is the lobby and media preview page.
- Camera and microphone are optional before joining.
- Teachers join as active participants.
- Students join as pending participants and wait for teacher approval.
- The lobby polls the participant endpoint until the student is approved or rejected.

### Room

- `/:meetingCode/room` is the live classroom.
- Students primarily see the teacher video or teacher screen share plus their own tile.
- Teachers can view active students, manage pending requests, remove or ban students, control student camera/mic requests, and use classroom controls.
- Room state sync is SSE-first through `/api/meetings/:meetingCode/events` with polling fallback in the client.

## Features

### Secure Meeting Identity

- Join identity uses `display_name`, `meeting_code`, and `role`.
- Participant IDs are generated from an HMAC-SHA256 prefix plus a UUIDv7 nonce suffix.
- Rejoin uses a `rejoin_token` ES256 JWT cookie with:
  - `HttpOnly`
  - `Secure`
  - `SameSite=Strict`
  - 300-second TTL
  - single-use nonce redemption
  - IP prefix and User-Agent hash binding
- The server stores a display name, a display-name hash, role, status, nonce, IP prefix, UA hash, active flag, and expiry data for each participant.
- A teacher bootstrap flow creates the first meeting registry record for a new meeting code.
- Only one active teacher is allowed per meeting.

### Waiting Room and Moderation

- Students start in `pending` status.
- Teachers can admit, reject, remove, or ban students.
- Bans are session-scoped and use a ban cookie plus repository state.
- Removed or banned students are pushed out through room-state updates.
- Teacher actions are checked on the server with active-teacher authorization.

### LiveKit Media

- Room tokens are issued by `/api/meetings/:meetingCode/token`.
- Tokens can be refreshed through `/api/meetings/:meetingCode/token/refresh`.
- LiveKit token TTL is 5 minutes.
- Teacher tokens can publish camera, microphone, screen share, and screen share audio.
- Student tokens can publish camera and microphone.
- The room client refreshes tokens before expiry.
- `lib/realtime/profiles.ts` defines classroom quality profiles:
  - `lecture`
  - `seminar`
  - `large-class`

### Classroom Controls

Teachers can update host controls for:

- mute-all request versioning
- forcing student cameras on
- Viva-Time
- meeting chat availability

Viva-Time blocks student AI chat while keeping teacher AI access available.

### Chat

- Meeting chat is scoped to the room.
- Teachers can see all meeting chat messages.
- Students see teacher messages and their own messages.
- Student meeting chat is controlled by the teacher's `meetingChatEnabled` setting.
- AI chat uses `/api/ai-chat`, OpenRouter, per-participant/IP rate limiting, and response length modes: `short`, `normal`, and `detailed`.
- AI chat requires `OPENROUTER_API_KEY` at runtime.

### Raise Hand

- Active participants can raise or lower their hand.
- Raise-hand updates are stored in participant state and broadcast to the room.
- The room UI shows a raised-hand popup/list.

### Attendance

- Teachers can set an attendance threshold from 1 to 100 percent.
- Attendance tracking starts when the threshold is first set.
- Student active time is accumulated while they are active in the room.
- Ending the meeting creates a final attendance summary with `present`, `absent`, or `banned` status.
- Students see their own final attendance result.
- Teachers see the full final attendance list.

### Teacher-Only Whiteboard

- Only active teachers can open, read, or update the whiteboard.
- Students do not receive a whiteboard entry point.
- The whiteboard is implemented with native canvas, not a third-party whiteboard package.
- Supported tools:
  - pen
  - highlighter
  - eraser
  - rectangle
  - circle
  - line
  - text
- Server validation limits drawable count, point count, text length, colors, widths, text size, and coordinate range.
- Whiteboard state includes drawables, undo history, redo future, version, and update timestamp.

## Routes

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Public Meetigate home page |
| `/landing` | Role/name/code entry and teacher code generation |
| `/:meetingCode` | Lobby, camera/mic preview, and join request flow |
| `/:meetingCode/room` | Live classroom room |

### API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/meeting/join` | `POST` | Secure join endpoint |
| `/api/meetings/join` | `POST` | Current UI join endpoint with the same join flow |
| `/api/meeting/rejoin` | `POST` | Redeem and rotate a rejoin cookie |
| `/api/meeting/leave` | `DELETE` | Leave through signed rejoin-cookie context |
| `/api/meetings/:meetingCode/leave` | `POST` | Leave a current UI meeting |
| `/api/meetings/:meetingCode/participants` | `GET` | Room snapshot: participants, pending list, session participant, host controls, chat, attendance, and teacher whiteboard state |
| `/api/meetings/:meetingCode/events` | `GET` | Server-Sent Events stream for room updates |
| `/api/meetings/:meetingCode/token` | `POST` | Issue a LiveKit room token |
| `/api/meetings/:meetingCode/token/refresh` | `POST` | Refresh a LiveKit room token |
| `/api/meetings/:meetingCode/admit` | `POST` | Teacher admits a pending participant |
| `/api/meetings/:meetingCode/reject` | `POST` | Teacher rejects a pending participant |
| `/api/meetings/:meetingCode/remove` | `POST` | Teacher removes a student from the room |
| `/api/meetings/:meetingCode/ban` | `POST` | Teacher bans a student session |
| `/api/meetings/:meetingCode/hand` | `POST` | Raise or lower hand |
| `/api/meetings/:meetingCode/host-controls` | `POST` | Update classroom host controls |
| `/api/meetings/:meetingCode/participant-controls` | `POST` | Teacher requests student camera/mic state |
| `/api/meetings/:meetingCode/chat` | `POST` | Send a room chat message |
| `/api/meetings/:meetingCode/whiteboard` | `GET`, `POST` | Teacher-only whiteboard read and update |
| `/api/meetings/:meetingCode/attendance/threshold` | `POST` | Set attendance threshold |
| `/api/meetings/:meetingCode/attendance/end` | `POST` | End meeting and finalize attendance |
| `/api/meetings/:meetingCode/signal` | `POST` | Send targeted WebRTC signaling events through the room event bus |
| `/api/ai-chat` | `POST` | Classroom AI tutor chat |
| `/api/debug/livekit` | `GET` | Development LiveKit configuration check |

## Codebase Map

```text
app/
  page.tsx                         Public home page
  landing/page.tsx                 Role/name/code entry
  [meetingCode]/page.tsx           Lobby and join flow
  [meetingCode]/room/page.tsx      Live classroom UI
  api/                             Route handlers
components/
  PeacockFan.tsx                   Shared visual component
lib/meetings/
  service.ts                       Main meeting business rules
  store.ts                         In-memory room state and event pub/sub
  repository.ts                    Persistence interface
  repository.memory.ts             In-memory repository
  repository.supabase.ts           Supabase repository
  repository.dual.ts               Supabase primary with memory fallback/parity behavior
  repository.factory.ts            Repository selection
  session.ts                       Rejoin-cookie parsing
  types.ts                         Meeting, participant, chat, attendance, whiteboard types
  validation.ts                    Meeting code and participant name validation
lib/security/
  identity.ts                      Participant ID generation
  rejoinToken.ts                   ES256 rejoin JWT and nonce handling
  rateLimit.ts                     Join rate limits
  requestContext.ts                IP prefix and UA hash helpers
  meetingRegistry.ts               In-memory meeting registry
  banCookie.ts                     Meeting ban cookie helpers
  env.ts                           Security env validation
lib/realtime/
  livekit.ts                       LiveKit token issuing helpers
  profiles.ts                      Classroom quality profiles
supabase/migrations/               Optional database schema
tests/security.test.ts             Security and identity tests
```

## Data and Persistence

By default, the app can run with the in-memory repository.

Set `MEETING_DB_ENABLED=1` and provide Supabase service credentials to enable the Supabase repository path. The factory creates a dual-write repository when Supabase configuration is available; otherwise it falls back to memory.

Supabase migrations define:

- `meetings`
- `participants`
- `meeting_bans`
- `host_controls`
- `room_events`
- `meeting_attendance_state`
- `meeting_attendance_records`
- secure session identity columns on `participants`
- a unique active-teacher index per meeting

## Environment Variables

Required for secure meeting APIs:

```env
SERVER_SECRET=replace_with_64_plus_hex_chars
REJOIN_TOKEN_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\nreplace_me\n-----END PRIVATE KEY-----"
REJOIN_TOKEN_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nreplace_me\n-----END PUBLIC KEY-----"
ALLOWED_ORIGINS=http://localhost:3000
```

Required for LiveKit:

```env
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=replace_me
LIVEKIT_API_SECRET=replace_me
```

Required for AI chat:

```env
OPENROUTER_API_KEY=replace_me
```

Optional for Supabase persistence:

```env
MEETING_DB_ENABLED=1
SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace_me
MEETING_DB_READ_PRIMARY=1
MEETING_DB_PARITY_LOGS=0
```

Notes:

- `SERVER_SECRET` must be a hex string with at least 64 characters.
- `ALLOWED_ORIGINS` is comma-separated.
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` can provide the Supabase URL for the service client.
- `MEETING_DB_READ_PRIMARY=1` reads from Supabase in the dual repository path.
- `MEETING_DB_PARITY_LOGS=0` disables dual-repository parity logs outside production.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Generate `SERVER_SECRET`:

```bash
npm run generate-secret
```

3. Create `.env.local` using `.env.example` as the base and add any missing optional values you need.

4. Run the development server:

```bash
npm run dev
```

5. Open:

```text
http://localhost:3000
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build the app |
| `npm run start` | Start the production server after build |
| `npm run lint` | Run Next lint command |
| `npm test` | Run Jest security tests |
| `npm run generate-secret` | Generate a suitable `SERVER_SECRET` |

## Testing

Run:

```bash
npm test
```

Current tests focus on the secure participant identity layer:

- participant ID format and uniqueness
- role authorization enforcement
- name validation and delimiter attack rejection
- rejoin token single-use behavior
- IP binding rejection
- expired token rejection
- participant cap enforcement
- invalid secret hard-fail
- secret leakage grep check

## Security and Middleware

The API middleware applies:

- HTTPS enforcement for non-local API requests when `x-forwarded-proto` is present
- origin allow-list checks from `ALLOWED_ORIGINS`
- CORS handling for API `OPTIONS`
- security headers:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Content-Security-Policy`
  - `Referrer-Policy`

## Production Checklist

- Rotate `SERVER_SECRET` and keep it out of source control.
- Use valid HTTPS in production.
- Configure `ALLOWED_ORIGINS` for deployed origins only.
- Provide LiveKit server credentials.
- Provide `OPENROUTER_API_KEY` if AI chat is enabled.
- Enable Supabase persistence if room state must survive process restarts.
- Replace in-memory nonce/rate-limit stores with durable backing for multi-instance production.
- Review logs for PII leakage.
- Schedule cleanup for expired meetings and participants.
- Verify security headers on the deployed app.
