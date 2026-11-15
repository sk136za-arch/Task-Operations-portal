# Task Operations Portal

Internal dashboard for managing tasks, deployments, imports, and operational timelines.

## Requirements

- Node.js 22.13 or newer

## Local development

```bash
npm ci
npm run dev
```

The development server starts on a local Vite/Vinext address (normally `http://127.0.0.1:5173`).

## Validation and production preview

```bash
npm run build
npm run start
```

The app uses Cloudflare D1 bindings for its task data. Local Wrangler state is stored in `.wrangler/` and is not committed.

## Main areas

- `app/` — dashboard UI and API routes
- `components/dashboard/` — operational dashboard components
- `db/` and `drizzle/` — D1 schema and migrations
- `public/` — static assets
