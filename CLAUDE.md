# Pixxel247 — Development Instructions

## Architecture Overview

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v3 (darkMode: "class") · Prisma 5 · MySQL/MariaDB or SQLite · JWT (jose) · bcryptjs
**Port:** 3336 in the app container; 7247 on the deployed Proxmox host
**Database:** Selected by the user in the first-run setup wizard and persisted in `data/site.config.json`

### Directory Structure

```
src/
  app/
    (setup)/              # Public first-run database and administrator wizard
    (dashboard)/          # Authenticated layout group
      layout.tsx          # Sidebar + top bar + profile modal. Reads feature flags.
      page.tsx            # Dashboard — stat tiles + placeholder tiles + recent users
      settings/page.tsx   # Tabbed settings: Users | Audit Log | Feature Flags | Documentation
      audit/page.tsx      # Standalone audit page (legacy, kept for direct URL access)
    api/
      auth/
        login/route.ts    # POST — sets bp_token + bp_theme cookies; logs LOGIN/LOGIN_FAILED
        logout/route.ts   # POST — clears bp_token
        signup/route.ts   # POST — creates pending user; checks `signup` feature flag
      me/
        theme/route.ts    # PATCH — saves dark/light preference to DB + cookie
        profile/route.ts  # PATCH — update name, email, password; re-issues JWT
      users/
        route.ts          # GET — list all users (admin)
        [id]/route.ts     # PATCH (status/role) + DELETE (admin)
      audit/route.ts      # GET — paginated audit log with action filter (admin)
      dashboard/route.ts  # GET — stat counts + recent users
      feature-flags/
        route.ts          # GET — all flags (authenticated)
        [key]/route.ts    # PATCH — toggle flag (admin)
      openapi/route.ts    # GET — OpenAPI 3.0 spec JSON (authenticated)
      changelog/route.ts  # GET — changelog entries from DB (authenticated)
    login/page.tsx
    signup/page.tsx
    layout.tsx            # Root layout — reads bp_theme cookie → applies dark class to <html>
    globals.css
  data/
    changelog.ts          # Static array of changelog entries — Claude edits this file
    nav.ts                # Nav item definitions + role defaults — Claude edits when adding nav items
  lib/
    prisma.ts             # Runtime MySQL/SQLite Prisma client facade
    setup.ts              # Persistent site config and database URL resolution
    auth.ts               # JWT sign/verify, getSession(), cookie names: bp_token, bp_theme
    initDb.ts             # Creates tables + seeds admin + seeds feature flags on first request
    audit.ts              # auditLog() helper — never throws
    flags.ts              # isFlagEnabled(key) — fails open (returns true on error)
  middleware.ts           # Protects all routes except auth, setup, health and avatars
```

### Database Tables

| Table | Key columns |
|---|---|
| `users` | id, email, password_hash, name, role (user/admin), status (pending/approved/rejected), theme (dark/light) |
| `audit_logs` | id, user_id (FK nullable), action, resource, resource_id, details (TEXT JSON), ip |
| `feature_flags` | key (PK), enabled (TINYINT), label, description |
| `changelog` | id, date (DATE), description (TEXT) — unique on (date, description) |
| `role_permissions` | role (VARCHAR PK part), nav_key (VARCHAR PK part) — many-to-many |

### Auth Flow
- Login sets `bp_token` (httpOnly JWT, 7d) + `bp_theme` (non-httpOnly, 1y)
- Root layout reads `bp_theme` server-side → applies `dark` class for SSR
- `getSession()` verifies `bp_token` → returns `{ sub, email, role, name }`
- Middleware redirects unauthenticated requests to `/login`
- New signups are `pending` — admin must approve before they can log in

### Feature Flags
Three built-in flags seeded by `initDb()`:
- `signup` — when disabled, `POST /api/auth/signup` returns 423 and the signup page shows a message
- `dashboard` — when disabled, Dashboard is removed from sidebar nav
- `menu` — when disabled, all nav links are hidden from sidebar

Flags are fetched client-side in the dashboard layout on mount.

---

## Changelog — REQUIRED on every feature completion

**Every time you complete a feature or make a meaningful change, you MUST:**

### Adding a new nav item (sidebar link)

When adding a new page that should appear in the sidebar:
1. Add it to `NAV_ITEMS` in `src/data/nav.ts` with a unique `key`, `href`, `label`, and `icon` (SVG path `d=` string)
2. Add default permissions to `DEFAULT_ROLE_PERMISSIONS` in the same file (decide which roles get access)
3. `initDb()` will seed the new permissions via `INSERT IGNORE` on next startup

---

1. Add a new entry to the **top** of the `CHANGELOG` array in `src/data/changelog.ts`:
   ```ts
   { date: "YYYY-MM-DD", description: "Brief description of what was added or changed" },
   ```
   Use today's actual date. Keep descriptions concise (one sentence, present-tense action).

2. `initDb()` will `INSERT IGNORE` any new entries into the `changelog` DB table on next startup — no extra steps needed.

The Changelog tab in Settings (`/settings` → Changelog) displays these entries live.

---

## Adding a New API Route

When you create a new API route at `src/app/api/<path>/route.ts`, you **must** also:

1. Add the endpoint(s) to `src/app/api/openapi/route.ts` under the `paths` object, following the existing pattern:
   - Group under an appropriate `tags` value
   - Include `summary`, `description`, request body schema (if applicable), and all response codes
   - Use `$ref: "#/components/schemas/..."` for User/AuditEntry/Error where appropriate

2. If the route performs any database write, call `auditLog()` from `@/lib/audit` with an appropriate `action` string.

3. If the new route is admin-only, check `session.role !== "admin"` and return 403.

4. If the route is public (no auth required), add it to the `publicPaths` list in `src/middleware.ts`.

### OpenAPI spec location
`src/app/api/openapi/route.ts` — the `spec` object is the single source of truth. The Documentation tab in Settings (`/settings` → Documentation) renders this spec live.

---

## First-run setup and environment

Fresh installations open `/setup`. The wizard requires a successful database test, supports either a persistent local SQLite file or a MySQL/MariaDB server, creates the schema, and creates the first administrator. Configuration is written with owner-only permissions to `PIXXEL247_DATA_DIR/site.config.json`; database passwords must never be committed.

```
PIXXEL247_DATA_DIR="data"
JWT_SECRET="..."
MONITORING_ENCRYPTION_KEY="..."       # optional; encrypts monitor headers/bodies, falls back to JWT_SECRET
```

`DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD_HASH` remain supported as a preconfigured development/legacy path. New deployments should use the wizard.

---

## Theme System
- `bp_theme` cookie → `dark` | `light`
- Root layout (`app/layout.tsx`) reads this SSR and adds `class="dark"` to `<html>`
- Tailwind uses `darkMode: "class"` — all dark styles use `dark:` prefix
- Toggle button in top bar (sun/moon icon) calls `PATCH /api/me/theme` and updates `document.documentElement.classList`

---

## Docker / Deployment
- `next.config.ts` has `output: "standalone"` for Docker builds
- `Dockerfile` generates both Prisma clients and runs as the non-root `nextjs` user
- `docker-compose.yml` persists setup configuration and SQLite data in the `pixxel247_data` named volume
- `Jenkinsfile` deploys Gitea commits to `/home/pixxel247` on Proxmox; `Jenkinsfile.dockerhub` publishes multi-architecture Docker Hub images
