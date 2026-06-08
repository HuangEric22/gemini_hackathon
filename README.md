# Geminigo

Geminigo is a Next.js travel-planning app that uses Google Maps/Places data,
Gemini, Clerk authentication, and Drizzle ORM with libSQL/Turso.

## Getting Started

Create your local environment file:

```bash
cp .env.example .env.local
```

Fill in the required keys, then apply database migrations:

```bash
npm run db:migrate
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Use `.env.example` as the source of truth for required keys.

Required for production:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- `DB_FILE_NAME`
- `DB_AUTH_TOKEN`

Optional:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_PLACES`
- `USE_MOCK_PLACES`

`GOOGLE_MAPS_API_KEY` is used by server actions. Some server code falls back to
`NEXT_PUBLIC_GOOGLE_MAPS_KEY`, but production should provide a server-side key so
browser and server API restrictions can be managed separately.

## Database Setup

The app uses Drizzle migrations. Production code should not create tables or
patch columns at runtime.

Local libSQL/SQLite:

```bash
DB_FILE_NAME=file:local.db
DB_AUTH_TOKEN=
npm run db:migrate
```

Production Turso/libSQL:

```bash
DB_FILE_NAME=libsql://your-database-your-org.turso.io
DB_AUTH_TOKEN=your-turso-auth-token
npm run db:migrate
```

Confirm the production database URL and token in your deployment provider before
deploying. For Turso, `DB_FILE_NAME` should be the remote `libsql://...` database
URL, and `DB_AUTH_TOKEN` should be a token with permission to access that
database.

Useful Drizzle commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
