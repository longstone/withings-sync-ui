# Withings Sync Orchestrator

Self‑hosted web UI and scheduler for running the `withings-sync` CLI. The app wraps Withings → Garmin/TrainerRoad sync flows in a single Docker image with an Angular front end, Fastify + Prisma backend, WebSockets for interactive runs, and a SQLite data store.

## Features
- Profiles with per-user config directories and optional Garmin/TrainerRoad targets
- Manual interactive runs with live terminal streaming over WebSocket
- Scheduled cron runs with prompt detection + safe timeout handling
- Encrypted secret storage (`SYNC_SECRET_KEY` or generated key file)
- Single container build that bundles backend, frontend, and `withings-sync`



## Quickstart for Users (Docker)
Use the prebuilt container; it bundles backend, frontend, and `withings-sync`.
```bash
docker run -p 3333:3333 \
  -v "$(pwd)/data:/app/data" \
  withings-sync-orchestrator:latest
```
- UI: `http://localhost:4200`
- API: `http://localhost:3333/api`
- Persist `data/` as a volume to keep DB, logs, and profile configs.

## Architecture (high level)
- **Frontend (Angular 20+)**: SPA served by the backend; connects to REST + WebSocket (`/api`, `/ws`).
- **Backend (Node 24 + Fastify)**: REST routes under `backend/src/routes`, services under `backend/src/services`, scheduler jobs under `backend/src/jobs`, WebSocket handlers in `backend/src/ws`.
- **Database (SQLite via Prisma)**: schema in `backend/prisma/schema.prisma`, client in `backend/src/db`.
- **Data directories**: `data/` (or `DATA_DIR`) holds `db/`, `logs/`, and `withings-config/<profileId>/`.

## Prerequisites
- Node.js 24.x and npm 10+ (per package)
- Python 3 (only required inside the container to run `withings-sync`)

## Quickstart for Development (local)
```bash
# Backend
cd backend
npm install
npm run prisma:generate
DATABASE_URL=file:./data/db/app.db DATA_DIR=$PWD/data npm run backend:dev

# Frontend (new shell)
cd frontend
npm install
npm run frontend:start
```
Backend listens on `http://localhost:3333`, frontend on `http://localhost:4200` (dev config points to the backend at `http://localhost:3333/api`).

## Configuration
- `DATA_DIR` (optional): directory for `db/`, `logs/`, `withings-config/`. Defaults to `/app/data/`.
- `DATABASE_URL` (optional): SQLite URL, e.g. `file:./data/db/app.db`.
- `SYNC_SECRET_KEY` (optional): 64‑char hex key for AES‑256‑CBC encryption. If not set, a key file is generated under `DATA_DIR/.sync-secret-key`.
- Withings app config is stored per profile in `withings-config/<profileId>/withings_app.json`. Do **not** commit real values. Example:
```json
{
  "client_id": "YOUR_CLIENT_ID",
  "consumer_secret": "YOUR_CONSUMER_SECRET",
  "callback_url": "https://your-domain.example/withings.html"
}
```
The UI settings screen can distribute this file to all profiles when custom app syncing is enabled.

## Tests
- Backend: `cd backend && npm test` (Jest)
- Frontend: `cd frontend && npm run frontend:test` (Vitest)
- E2E (Playwright): from repo root `npm run test-e2e`

## Build
```bash
# Backend
cd backend && npm run backend:build

# Frontend
cd frontend && npm run frontend:build
```

## Docker (single image)
The provided `Dockerfile` installs `withings-sync`, builds backend + frontend, and exposes port `3000` (serve) / `3333` (API) inside the container. Typical build:
```bash
docker build -t withings-sync-orchestrator .
docker run -p 3333:3333 -p 4200:4200 -v "$(pwd)/data:/app/data" withings-sync-orchestrator
```
Persist `data/` as a volume to keep DB, logs, and profile configs.

## Security Notes
- Never store real secrets in Git.
- Keep `data/` and `dist/` out of version control (see `.gitignore`); they can contain logs and generated configs.
- For responsible disclosure, open a private issue or contact the maintainers before publishing vulnerabilities.

## License
GNU Affero General Public License v3.0 (AGPL-3.0).

## Contributing
Issues and PRs are welcome. Please include:
- What changed and why
- How to reproduce/verify (commands, screenshots for UI)
- Tests added/updated (or rationale if not applicable)
