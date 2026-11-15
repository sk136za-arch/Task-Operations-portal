# Task Operations Portal

Internal dashboard for managing tasks, deployments, imports, and operational timelines. The app is built with React, Vinext/Vite, Cloudflare Workers, and Cloudflare D1.

## What you need

- [Node.js](https://nodejs.org/) **22.13 or newer** (`node --version` to check)
- npm (bundled with Node.js)
- Git

No `.env` file, cloud credentials, or external database is needed for local development. The application uses a local Cloudflare D1 database stored under `.wrangler/state`.

## First-time setup

From the project directory, install the exact package versions locked in `package-lock.json`:

```powershell
npm ci
```

Build once to generate the local Wrangler configuration:

```powershell
npm run build
```

Create the local D1 schema by applying the migrations below **in order**. Run each command once for a new local database.

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_young_zzzax.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_long_energizer.sql
```

The first migration creates the tables and initial administrator record. Without these commands, opening the app fails with `D1_ERROR: no such table: users`.

## Run the app

```powershell
npm run dev
```

Open the local address printed by Vinext, usually [http://127.0.0.1:5173](http://127.0.0.1:5173). Stop the server with `Ctrl+C`.

Local development simulates ChatGPT sign-in. The default local account is `seedy@sites.test`, so the first visit redirects through the local sign-in route automatically.

## Local access control

The initial database migration grants admin access only to `sk136za@gmail.com`. The simulated local account (`seedy@sites.test`) therefore displays **Access pending** after the schema has been created. To test the complete dashboard locally, grant that account an admin role:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --command "INSERT INTO users (id, email, display_name, role, active, granted_by, granted_at, updated_at) VALUES ('local:seedy','seedy@sites.test','Seedy','admin',1,'local setup',datetime('now'),datetime('now'));"
```

Refresh the browser after running the command. For another local user, replace the ID, email, and display name in the SQL statement.

## Day-to-day workflow

After the first-time setup, use:

```powershell
npm run dev
```

You do not need to reinstall packages or rerun migrations unless you deleted `.wrangler/state`, changed dependencies, or added a new migration.

When a new migration is added, build again and apply only that new migration to your local database.

## Validate and preview a production build

```powershell
npm run build
npm run start
```

`npm run start` serves the already-built Worker locally via Wrangler. It does not deploy anything.

Other useful commands:

```powershell
npm run lint
npm run db:generate
```

`npm run db:generate` creates Drizzle migration files after changes to `db/schema.ts`; review generated SQL before applying it.

## Troubleshooting

| Symptom | Cause and solution |
| --- | --- |
| `D1_ERROR: no such table: users` | The local schema is missing. Follow the two migration commands in **First-time setup**. |
| **Access pending** | The signed-in user has no active role. Add the local test user with the SQL command in **Local access control**. |
| `npm ci` fails | Verify Node.js is version 22.13 or later, then delete only `node_modules` and run `npm ci` again. |
| Port 5173 is already in use | Stop the other development server, or run `npm run dev -- --port 5174`. |
| Changes are not reflected | Stop `npm run dev`, start it again, and refresh the browser. |

## Project structure

- `app/` — dashboard pages, styling, and API routes
- `components/dashboard/` — dashboard UI components
- `db/` — Drizzle database connection and schema
- `drizzle/` — D1 migrations and migration metadata
- `lib/` — authorization, validation, CSV, and integration utilities
- `public/` — static assets
- `worker/` — Cloudflare Worker entry point
- `.openai/hosting.json` — Sites deployment configuration and D1 binding (`DB`)

## Data and local files

Local database data and framework state live in ignored directories such as `.wrangler/`, `.vinext/`, `.next/`, and `dist/`. They are not committed. Do not put secrets in source control.
