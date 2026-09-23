# OAGTH Lucky Award

Next.js presentation screen and admin dashboard backed by Supabase Auth/Postgres.

- `/`: authenticated presentation screen with prize name and winner celebration
- `/admin`: admin-only participant/prize management and searchable winner history
- Production awards are selected and recorded atomically in Postgres; display reloads recover the same result.
- Local development without Supabase uses a clearly labelled in-memory demo. Demo data is not persistent or shared across separate browser runtimes.

## Development

Use Node.js 22.x, then `npm ci` and `npm run dev`.
To connect a database, copy `.env.example` to `.env.local` and fill in the public Supabase URL/key.
Run both SQL migrations and create an approved Auth user before using configured mode.

## Verification

`npm run check` runs ESLint, TypeScript and Postgres/model tests.
`npm run build` builds production and requires the public Supabase environment variables.

## Production

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for your Supabase, GitHub and Vercel projects, roles, migrations, environment configuration and launch checks.
Never put secret/service-role keys in the browser or commit `.env.local`.
