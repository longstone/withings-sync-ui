# Repository Guidelines

## Project Structure & Module Organization
- Root layout: `backend/` (Fastify + Prisma API), `frontend/` (Angular SPA), `prisma/` (SQLite dev db + schema), `data/` (runtime artifacts), and `Dockerfile` for container builds.
- Backend layout: entrypoint `backend/src/app.ts`; HTTP handlers in `backend/src/routes/`; domain logic in `backend/src/services/`; background tasks in `backend/src/jobs/`; WebSocket handlers in `backend/src/ws/`; Prisma client setup in `backend/src/db/`. Build output lands in `backend/dist/`.
- Frontend layout: `frontend/src/app/` for features, `frontend/src/environments/` for config, `frontend/src/styles.scss` for global styles, and `frontend/public/` for static assets. Angular build output goes to `frontend/dist/`.

## Setup, Build, and Dev Commands
- Install deps per package: `cd backend && npm install`, `cd frontend && npm install`. Run Prisma client codegen after schema changes: `npm run prisma:generate`.
- Backend: `npm run dev-backend` (watch mode), `npm run build-backend` (TypeScript compile), `npm run start-backend` (serve compiled output), `npm run prisma:migrate` (apply/create migrations), `npm run prisma:studio` (inspect DB).
- Frontend: `npm run start-frontend` (dev server), `npm run build-frontend` (prod bundle), `npm run watch-frontend` (dev watch).

## Coding Style & Naming Conventions
- TypeScript across backend and frontend; prefer 2-space indentation, single quotes, and no trailing semicolons in backend to match existing files.
- Frontend uses Prettier (`printWidth: 100`, single quotes, Angular parser for templates). Run your editor formatter before commits.
- Name modules by purpose (`SchedulerService`, `WithingsSyncRunner`), route files by resource (`profiles.ts`, `runs.ts`), and tests as `*.spec.ts`.
- **Angular Control Flow (v20+)**: Use the new block syntax instead of structural directives:
  - Replace `*ngIf` with `@if` blocks
  - Replace `*ngFor` with `@for (item of items; track item.id)` blocks (track expression is required)
  - Replace `*ngSwitch` with `@switch` blocks

## Testing Guidelines
- Backend tests use Jest: `npm run test-backend`. Add unit tests alongside source files or under a dedicated `__tests__` folder; cover new services, route handlers, and schedulers.
- Frontend tests use Vitest: `npm run test-frontend`. Co-locate specs with components (`component-name.component.spec.ts`). Add minimal fixtures/mocks rather than hitting real APIs.
- Target: cover new code paths you introduce; include regressions as explicit test cases.

## Commit & Pull Request Guidelines
- Prefer concise, imperative commit subjects (e.g., `Add scheduler cleanup guard`). If touching schema, mention it (e.g., `Add onboarding_session table`).
- PRs should describe intent, key changes, and how to verify (commands run, screenshots for UI changes). Link related issues if applicable.
- Keep diffs small and focused; include database migration notes and env variable changes in the PR description.
