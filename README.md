# Task Operations Portal

Internal dashboard for tasks, deployments, imports, and operational timelines. The application uses React, Vinext/Vite, Cloudflare Workers, and **Supabase PostgreSQL**.

## Prerequisites

- [Node.js](https://nodejs.org/) 22.13 or newer
- npm (included with Node.js)
- Git
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running locally
- A Supabase project (needed only for production deployment)

## Build and test locally

### 1. Start an isolated local Supabase stack

The local workflow uses Docker so that test data never reaches production. Start Docker Desktop first, then run:

```powershell
npx supabase@latest start
```

The command starts local Postgres, Auth, Storage, and related Supabase services. It prints a local API URL and a `service_role` key; keep the terminal output available.

### 2. Configure the local app environment

Copy the environment template:

```powershell
Copy-Item .env.example .env.local
```

Set the local values printed by `supabase start` (the usual API URL is `http://127.0.0.1:54321`):

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=<local-service_role-key-from-supabase-start>
# Optional admins in addition to sk136za@gmail.com
ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

You may use the equivalent `SUPABASE_SERVICE_ROLE_KEY` variable name instead. Use the **service_role** key printed by `supabase start`, not the anon key.

Every signed-in user is automatically added to **Access** as a `viewer` on their first visit; viewers can view data but cannot make changes. Add comma-separated addresses to `ADMIN_EMAILS` to promote them to admin automatically. `sk136za@gmail.com` remains an admin even when `ADMIN_EMAILS` is empty.

When running locally, the ChatGPT sign-in mock always uses `seedy@sites.test`. To use the full local admin experience, include it in the admin list:

```env
ADMIN_EMAILS=seedy@sites.test
```

Restart `npm run dev` after changing `.env.local`.

Never commit `.env.local`, expose `SUPABASE_SECRET_KEY` to browser code, or prefix it with `NEXT_PUBLIC_`.

### 3. Create the local schema

Apply the tracked migration to Docker's local Postgres:

```powershell
npx supabase@latest db push --local
```

The migration at [`supabase/migrations/20261116000000_initial_schema.sql`](supabase/migrations/20261116000000_initial_schema.sql) creates all tables, indexes, RLS settings, and the bootstrap administrator in the local Docker database.

### 4. Install dependencies

```powershell
npm ci
```

### 5. Start development mode

```powershell
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), or the local address printed by Vinext. The app reads and writes only to the Docker-hosted Supabase database.

The complete local run sequence is therefore:

```powershell
npm ci
Copy-Item .env.example .env.local
npx supabase@latest start
# Fill .env.local with the URL and service_role key printed above
npx supabase@latest db push --local
npm run dev
```

### 6. Validate the production build locally

```powershell
npm run build
npm run start
```

`npm run start` serves the built Worker on your machine while retaining the same Supabase connection configuration from `.env.local`.

Additional commands:

```powershell
npm run lint
```

## Deploy to production

1. Validate locally:

   ```powershell
   npm ci
   npm run build
   ```

2. Apply any new SQL migrations to the production Supabase project:

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref <production-project-ref>
   npx supabase@latest db push --remote
   ```

3. In the Cloudflare Sites environment settings, add these **server-side runtime variables**:

   ```env
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_<your-server-only-secret>
   ```

4. Commit and push the source revision, then publish through the Sites workflow configured by `.openai/hosting.json`.

Do not place credentials in `.openai/hosting.json`, source files, or client-side environment variables.

## Troubleshooting

| Symptom | Solution |
| --- | --- |
| `Supabase is not configured` | Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to `.env.local`, then restart the server. |
| Database table is missing | For local use, run `npx supabase@latest db push --local`; use `--remote` only for the intended hosted project. |
| `internal error; reference = ...` when loading the app | Ensure `.env.local` uses the `service_role` key, then apply the newest migration with `npx supabase@latest db push --local` and restart `npm run dev`. |
| `Access pending` | Add the signed-in user's email to the `users` table with an active role. |
| Port 5173 is already in use | Stop the other server or use `npm run dev -- --port 5174`. |

## Project structure

- `app/` — pages, server routes, and styles
- `components/dashboard/` — dashboard UI
- `db/` — server-only Supabase client and data types
- `supabase/migrations/` — PostgreSQL database schema migrations
- `worker/` — Cloudflare Worker entry point
- `.openai/hosting.json` — Sites hosting configuration
