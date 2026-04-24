# Meeting App

Production-grade meeting analysis platform with LLM-driven insights and computer vision.

## Architecture

```
Frontend (Next.js 15 + Supabase Auth)
├── Supabase (Auth + Database)
└── Backend API (LLM + CV Processing)
    ├── Verifies Supabase JWT tokens
    ├── Processes meetings/insights
    └── Generates AI insights
```

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Auth**: Supabase Auth (email/password + OAuth)
- **Database**: Supabase PostgreSQL
- **Backend**: Node.js, Express, TypeScript
- **AI/ML**: OpenAI/Anthropic, Computer Vision

## Project Structure

```
Meeting-App/
├── src/                    # Frontend
│   ├── app/
│   │   ├── auth/callback/  # OAuth callback
│   │   ├── sign-in/        # Sign-in page
│   │   ├── sign-up/        # Sign-up page
│   │   ├── sign-out/       # Sign-out route
│   │   ├── dashboard/      # User dashboard
│   │   ├── api/auth/       # Auth check endpoint
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── auth.ts         # Server-side auth helpers
│   │   └── api/            # API clients (frontend → backend)
│   │       ├── meetings.ts
│   │       ├── insights.ts
│   │       └── computerVision.ts
│   └── utils/
│       └── supabase/       # Supabase clients
│           ├── client.ts   # Browser client
│           ├── server.ts   # Server component client
│           └── middleware.ts # Middleware client
├── backend/
│   ├── src/
│   │   ├── index.ts        # Express entry
│   │   ├── database.ts     # DB + Supabase admin client
│   │   ├── middleware/
│   │   │   └── auth.ts     # JWT verification middleware
│   │   └── routes/
│   │       ├── meetings.ts
│   │       ├── insights.ts
│   │       └── computerVision.ts
│   ├── supabase-schema.sql
│   └── .env
└── README.md
```

## Setup Instructions

### 1. Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Run `backend/supabase-schema.sql` in Supabase SQL Editor
3. Get credentials from **Settings → API**:
   - Project URL
   - `anon` public key (publishable key)
   - `service_role` key (secret key)
   - Database password (from connection string)
4. Enable OAuth providers (Google, GitHub) in **Authentication → Providers** (optional)

### 2. Environment Variables

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_anon_key
BACKEND_API_URL=http://localhost:3001/api
```

### 2.1 Supabase Redirect URLs

For OAuth and email auth redirects to work in local development, open **Supabase Dashboard → Authentication → URL Configuration** and make sure these values are configured:

- `Site URL`: your primary app URL, for example `https://meeting-app-liard.vercel.app`
- `Additional Redirect URLs`:
  - `http://localhost:3000/auth/callback`
  - `https://meeting-app-liard.vercel.app/auth/callback`
  - `http://localhost:3000/**`
  - `https://meeting-app-liard.vercel.app/**`

If `http://localhost:3000/auth/callback` or a matching wildcard pattern is missing, Supabase can ignore the local `redirectTo` value and fall back to the production `Site URL`, which causes sign-in to bounce to Vercel with a `?code=...` query string.

**Backend** (`backend/.env`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
OPENAI_API_KEY=your_openai_api_key
PORT=3001
NODE_ENV=development
```

### 3. Install Dependencies

```bash
# Frontend
npm install

# Backend
cd backend
npm install
```

### 4. Development

```bash
# Frontend (port 3000)
npm run dev

# Backend (port 3001)
cd backend
npm run dev
```

Visit http://localhost:3000

## Authentication Flow

1. User signs in via `/sign-in` or `/sign-up`
2. Supabase Auth creates session (stored in cookies)
3. Middleware (`src/middleware.ts`) protects routes - redirects unauthenticated users
4. Frontend API calls include `Authorization: Bearer <access_token>` header
5. Backend `authMiddleware` verifies token with Supabase Admin API
6. Backend uses user ID for database operations

## API Endpoints (Backend - authenticated)

All require `Authorization: Bearer <access_token>` header.

### Meetings
- `POST /api/meetings` - Create meeting
- `GET /api/meetings` - List user's meetings
- `GET /api/meetings/:id` - Get meeting details
- `PATCH /api/meetings/:id` - Update meeting
- `DELETE /api/meetings/:id` - Delete meeting

### Insights
- `POST /api/insights/generate` - Generate LLM insight for meeting
- `GET /api/insights/user/:userId` - Get user insights (own only)

### Computer Vision
- `POST /api/cv/analyze` - Start video analysis
- `GET /api/cv/:id` - Get analysis status/results

## Database Schema

Run `backend/supabase-schema.sql` in Supabase SQL Editor. Tables:
- `users` (if needed, Supabase auth.users exists)
- `meetings`
- `insights` (LLM-generated)
- `cv_analyses`

## Next Steps

1. **LLM Integration**: Implement actual LLM calls in `backend/src/routes/insights.ts`
2. **CV Pipeline**: Add video processing in `backend/src/routes/computerVision.ts`
3. **Job Queue**: Add BullMQ/Redis for async processing
4. **Real-time**: Enable Supabase Realtime for live updates
5. **File Upload**: Implement video upload to Supabase Storage
6. **UI Pages**: Build meetings/insights listing pages
7. **Error Handling**: Add better error messages and loading states
8. **Testing**: Write tests and seed database with sample data

## Production Deployment

### Frontend
- Deploy to Vercel
- Set environment variables
- Update `BACKEND_API_URL`

### Backend
- Deploy to Railway / Render / Fly.io
- Use Supabase service role key
- Add monitoring (Sentry, LogRocket)

### Database
- Run migrations in Supabase production
- Enable row-level security (RLS) if needed
- Set up backups
