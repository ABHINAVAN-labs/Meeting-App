# Meeting App

Meeting analysis app with a Next.js frontend and a separate Express backend scaffold.

## Architecture

```text
Frontend (Next.js + Supabase Auth)
|-- Supabase (Auth + Database)
`-- Backend API (Express scaffold)
    |-- Verifies Supabase JWT tokens
    `-- Connects to PostgreSQL
```

## Tech Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Auth: Supabase Auth
- Database: Supabase PostgreSQL
- Backend: Node.js, Express, TypeScript

## Project Structure

```text
Meeting-App/
|-- src/                       # Frontend only
|   |-- app/                   # App Router pages and routes
|   |-- lib/                   # Frontend auth helpers
|   |-- types/
|   `-- utils/supabase/        # Browser/server/middleware clients
|-- backend/
|   |-- src/                   # Backend only
|   |   |-- index.ts           # Express entry
|   |   |-- database.ts        # PostgreSQL + Supabase clients
|   |   |-- env.ts
|   |   |-- middleware/auth.ts
|   |   `-- types/express.d.ts
|   `-- supabase-schema.sql
|-- supabase/
|   |-- migrations/            # Ordered SQL migrations for schema changes
|   `-- README.md              # Migration runbook
`-- README.md
```

## Environment Variables

Frontend `.env.local`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

Backend `backend/.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
PORT=3001
NODE_ENV=development
```

## Development

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

## Current Status

- Sign-in, sign-up, sign-out, OAuth callback, and onboarding are implemented in the frontend.
- The backend health check and Supabase auth verification middleware are implemented.
- Meetings, insights, and computer vision routes are not implemented yet.

## Next Steps

1. Add real backend route modules and mount them from `backend/src/index.ts`.
2. Decide how app users map to Supabase auth users in the database schema.
3. Build the first end-to-end meetings flow.
4. Add insights and CV processing after the meetings slice works.
5. Add tests and better error handling.
