# Taskflow

Taskflow is a collaborative task management app built with Next.js, Express,
Socket.IO, and PostgreSQL. It supports multiple workspaces, projects, task
boards, comments, checklists, community updates, notifications, task search,
analytics, invitations, and password recovery.

## Requirements

- Node.js 20.9 or newer
- PostgreSQL 15 or a compatible managed PostgreSQL service
- SMTP credentials for email invitations and password recovery (optional for
  local development; required for those email workflows)

## Local development

1. Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` and a
   random `JWT_SECRET` (for example, generate 48 random bytes with Node's
   `crypto.randomBytes(48).toString('hex')`). Keep this file private.
2. Install dependencies and start the API:

   ```sh
   cd backend
   npm install
   npm run dev
   ```

   The API listens on port 4000. It applies ordered SQL migrations from
   `backend/migrations` on startup. Migrations are recorded in
   `schema_migrations`, serialized across instances with a PostgreSQL advisory
   lock, and each file plus its record is applied atomically.
3. Copy `frontend/.env.example` to `frontend/.env.local`. Set
   `NEXT_PUBLIC_API_URL=http://localhost:4000`, install dependencies, and start
   the UI:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

4. Open <http://localhost:3000>. The API health endpoint is
   <http://localhost:4000/health>.

## Email configuration

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in the
backend environment. Gmail accounts require a Google App Password. Set
`APP_URL` to the public frontend origin so invitation and password-reset links
point to the deployed application. Password-reset links and OTPs are single
use, expire after 30 minutes, and OTP attempts are limited.

## Local demo workspace

The repository includes an idempotent demo seed with two sample teammates,
two projects, realistic tasks in several workflow states, task descriptions,
assignees, checklists, comments, activity, notifications, and a community
update. The demo accounts are intended for a local presentation only:

- `demo@taskflow.local` / `TaskflowDemo2026!`
- `alex@taskflow.local` / `TaskflowDemo2026!`

Create an empty local PostgreSQL database named `taskflow_demo`, copy
`backend/.env.demo.example` to `backend/.env.demo`, then set the local
PostgreSQL username and password in both database URLs. Seed the database:

```sh
cd backend
npm run demo:seed
```

The seed command uses `DEMO_DATABASE_URL` only and refuses to connect unless
the database host is localhost or a loopback address. It applies the regular
migrations and can be rerun safely. To run the API against this database,
select `.env.demo` as dotenv's config file and start the API:

```sh
# PowerShell
$env:DOTENV_CONFIG_PATH = ".env.demo"
npm run dev

# macOS / Linux
DOTENV_CONFIG_PATH=.env.demo npm run dev
```

To show the demo links on the landing and login pages, set
`NEXT_PUBLIC_ENABLE_DEMO=true` in `frontend/.env.local` and restart the
frontend. Keep this option off in deployed builds; the credentials are public
demo credentials and provide access to shared sample data.

## Workspaces, permissions, and workflow

New accounts receive a personal workspace. Workspace membership scopes project
access, and project membership scopes individual project access. Workspace and
project owner/admin/member/viewer roles are checked by the API; IDs supplied by
the browser are never treated as authorization. Passwords are hashed, auth
tokens expire, and reset tokens are stored as hashes.

New tasks start in Backlog or To do. Task changes must follow the transition
map in `backend/src/workflow.ts`; the API returns allowed next statuses and
rejects invalid moves. Search, dashboard metrics, and activity feeds are
computed from the database and scoped to the authenticated user's workspace
and project memberships.

## Tests and builds

Run backend unit tests with:

```sh
cd backend
npm test
```

The core API integration suite runs only when `TEST_DATABASE_URL` points to a
dedicated disposable test database. Set it in the environment before running
`npm test`; it creates temporary users and deletes them afterward. Never set it
to production or a database with data you need to preserve. Without that
variable, the workflow unit tests run and database-backed integration tests
are reported as skipped. Run only the API integration suite with
`npm run test:integration` after setting that variable.

Production builds:

```sh
cd backend && npm run build && npm start
cd frontend && npm run build && npm start
```

## Deployment

- Provision PostgreSQL and set `DATABASE_URL` and `JWT_SECRET` as backend
  environment secrets. Use TLS for remote databases.
- Set `FRONTEND_URL` to the deployed frontend origin(s), comma-separated if
  needed. Set `APP_URL` to the canonical public frontend origin.
- Set SMTP values when email delivery is required.
- Set `NEXT_PUBLIC_API_URL` to the public API origin when building the frontend.
- Build and start each package with the commands above. The backend applies
  pending migrations before binding its port; make sure the deploy identity can
  create and alter the app's tables.
- Expose the frontend and API over HTTPS. Configure the hosting platform's
  health check to request `/health` from the API.

## Main routes

- `/` public landing page; `/login`, `/signup`, `/forgot-password`, and
  `/reset-password` account flows
- `/projects` project list; `/projects/:id` task board
- `/my-tasks`, `/search`, `/dashboard`, and `/community` personal/workspace
  views
- `/workspaces`, `/profile`, and `/settings` workspace and account management
