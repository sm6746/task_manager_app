# Team Task Manager

A full-stack team task manager built with React, Vite, Supabase Auth, Supabase Postgres, REST-style Supabase Data API operations, role-based access, and Railway deployment support.

## Features

- Signup and login with Supabase Auth
- Project creation and member management
- Admin and member project roles
- Task creation, assignment, due dates, and status tracking
- Dashboard metrics for total, completed, in-progress, and overdue tasks
- Database relationships, validations, indexes, and row-level security policies

## Tech Stack

- React 19 + TypeScript + Vite
- Supabase Auth and Postgres
- Supabase Data API through `@supabase/supabase-js`
- Zod validation
- Railway deployment

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.

3. Copy `.env.example` to `.env` and add your Supabase values:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

4. Start the app:

```bash
npm run dev
```

## Railway Deployment

1. Push this repository to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add environment variables from `.env.example`.
4. Deploy. Railway uses `railway.json` to build and serve the Vite app.

## Supabase Notes

Run the SQL schema before launching. For new Supabase projects, confirm the `public` tables are exposed to the Data API or apply the included grants. RLS policies are enabled for every app table.

For selection/demo flows, disable email confirmation in Supabase Dashboard under Authentication settings, or confirm the user email before logging in. Supabase may show `email rate limit exceeded` after repeated signup attempts; wait for the cooldown or configure a custom SMTP provider.
OR TRY

FULL NAME == ram
EMAIL == ram22may@gmail.com
PASSWORD = ram14years

## Submission

- Live URL: add your Railway URL here
- GitHub repo: add your repository URL here
