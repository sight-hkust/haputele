# HapuTele

Telemedicine platform for the HapuTele program — a FastAPI + Postgres backend in `backend/`, a Next.js 14 (App Router) frontend in `frontend/`, and an S3-compatible object store for blobs (signatures, rubber stamps, attachments), all orchestrated by `docker compose`. In dev the object store is a local `rustfs` container; in prod it points at real S3. Video transport is LiveKit (Cloud or self-hosted).

The live API contract is browsable at `/docs` (Swagger) once the stack is up; the database schema is defined by the Alembic migrations under `backend/alembic/versions/`.

## Run with Docker

```bash
cp .env.example .env             # first time only — adjust JWT_SECRET, passwords, LiveKit + S3 creds
docker compose up --build        # builds and starts db + rustfs + api + frontend
```

Once the containers are up:

| Service  | URL                                  |
|----------|--------------------------------------|
| Frontend | http://localhost:3000                |
| API      | http://localhost:8000                |
| Swagger  | http://localhost:8000/docs           |
| Health   | http://localhost:8000/health         |
| Setup status | http://localhost:8000/setup/status |
| Object store (rustfs console) | http://localhost:9001 (login with `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`) |

Boot sequence (`backend/entrypoint.sh`): wait for Postgres → `alembic upgrade head` → `python -m app.scripts.bootstrap_setup_token` (generates/reuses the first-run setup token) → `exec uvicorn`. On startup the API's lifespan also calls `ensure_bucket()` and refuses to come up against a missing/unreachable object store. `api` waits for both `db` and `rustfs` to pass their healthchecks before starting; `frontend` only `depends_on` `api` (no health condition), so it may come up momentarily before the API is serving.

### First-run setup

Until `/setup/initialize` succeeds, the API is **uninitialized**: every non-`/health`, non-`/setup/*`, non-`/docs|/redoc|/openapi.json` route returns `409 setup_required`. On a fresh `docker compose up` (empty volumes), the api container prints a banner to stdout with a one-time setup token, and also writes it to `/data/setup-token` inside the container:

```bash
docker compose logs api | grep -A1 "first-run setup token"
# or
docker compose exec api cat /data/setup-token
```

POST that token to `/setup/verify-token` to receive a 15-minute setup-session JWT, then POST the institute identity, sys-admin credentials, timezone, and master consent version to `/setup/initialize`. After init the token file is deleted and `/setup/*` routes (except `/setup/status`) return `409 setup_already_completed`. The exact request/response shapes are in Swagger at `/docs`.

### Default credentials

There are no pre-seeded accounts by default — account creation is owned entirely by the first-run wizard and the sys-admin UI (the old `seed.py` was removed in favour of this flow). The sys-admin is created when the operator finishes the first-run wizard; everyone else is created afterwards:

| Role         | Username          | Password                              | Created by |
|--------------|-------------------|----------------------------------------|-----|
| sys-admin    | (operator-chosen) | (operator-chosen, min 10 chars)        | `/setup/initialize` |
| admin        | (operator-chosen) | (operator-chosen)                      | wizard stage 3 (optional) or `POST /sysadmin/accounts` |
| healthworker | (operator-chosen) | (operator-chosen)                      | wizard stage 3 (optional) or `POST /sysadmin/accounts` |
| doctor       | (operator-chosen) | (operator-chosen)                      | `POST /doctors` from the admin UI |

All four roles are unified behind a single `/login` form — there are no role tabs. The backend looks up the account by username alone and the response carries the resolved role, which decides where the client lands.

`sys-admin` is platform-administrative (logs, backups, observability) and is the **only** DB-enforced singleton (`accounts_one_sysadmin_idx`); it can only be minted by `/setup/initialize`, never by `/sysadmin/accounts`. As of migration `0007_relax_role_singletons`, **admin and healthworker are no longer singletons** — the operator can create as many of each as needed via the wizard or `POST /sysadmin/accounts`. (The old `accounts_one_admin_idx` / `accounts_one_healthworker_idx` indexes were a relic of the shared-kiosk `seed.py` era and have been dropped.)

### Common operations

```bash
docker compose logs -f api                          # tail backend logs
docker compose logs -f frontend                     # tail Next.js logs
docker compose exec api python -m app.scripts.bootstrap_setup_token  # re-print setup token banner if uninitialized
docker compose exec api cat /data/setup-token       # read on-disk setup token plaintext
docker compose exec api python -m demo_seed         # populate demo data (manual, not on boot)
docker compose exec db psql -U hapu haputele        # psql shell
docker compose down                                 # stop containers (keep all volumes)
docker compose down -v                              # stop AND wipe all volumes (db_data + api_data + rustfs_data)
```

### Schema migrations

Schema is owned by Alembic under `backend/alembic/versions/`. `entrypoint.sh` runs `alembic upgrade head` on every container start, so deploying a new migration is just a redeploy. `models.py` is a SQLAlchemy read/write helper — `Base.metadata.create_all` is never called, and CHECK constraints / partial unique indexes / triggers live only in migrations.

```bash
docker compose exec api alembic current             # show current revision
docker compose exec api alembic history             # list migrations
docker compose exec api alembic upgrade head        # apply pending
docker compose exec api alembic revision -m "..."   # author new migration
```

Adding a column requires both an Alembic migration AND a `models.py` mapping update. Adding a constraint requires a migration only. The migrations themselves are the table-by-table source of truth.

## Configuration

Config can come from environment variables, a `.env` file, or an optional YAML file (`config.yaml`, path overridable with `CONFIG_FILE`). Precedence, highest → lowest, is **real env vars > `.env` > `config.yaml` > code defaults** (see `backend/app/config.py`). `.env.example` documents the env layer; `config.yaml.example` documents the same keys for the YAML layer. A missing YAML file is fine — it just contributes nothing.

Notable env vars (full schema and inline comments in `.env.example`):

| Var | Purpose |
|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Database init + composed into `DATABASE_URL` by `docker-compose.yml`. |
| `JWT_SECRET` / `JWT_ALG` / `JWT_EXPIRE_MIN` | Token signing (HS256, 8 h default). Also signs the 15-min setup-session JWT. The JWT is delivered to the browser as an HttpOnly `session` cookie, not in the response body. |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` / `COOKIE_DOMAIN` | Session cookie attributes. `COOKIE_SECURE=true` is the safe default — browsers refuse to send `Secure` cookies over plain HTTP, so production deploys work out of the box; set to `false` only for local HTTP dev. `COOKIE_SAMESITE=lax` blocks cross-site CSRF vectors. `COOKIE_DOMAIN` empty means host-only cookies (recommended). |
| `CORS_ALLOW_ORIGINS` | Comma-separated list of origins permitted to make credentialed requests. Empty (default) is correct when the frontend uses the built-in `/api` rewrite. Populate with explicit origins for cross-origin deploys — wildcard is forbidden in credentialed mode. |
| `MASTER_CONSENT_VERSION` | First-run prefill default for the setup wizard. Runtime value lives in `system_config.master_consent_version` after init; this env var is **not** consulted at request time post-init. |
| `APP_TIMEZONE` | First-run prefill default for the setup wizard, plus Postgres `TZ` and container clocks. Runtime display zone lives in `system_config.app_timezone` after init. |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Video transport. If any is empty, `POST /appointments/{id}/meeting-token` fails closed with `422 livekit_not_configured`. The same `LIVEKIT_API_SECRET` verifies the signed webhook callbacks at `POST /livekit/webhook`. |
| `LIVEKIT_NODE_IP` | IP advertised to browsers as the WebRTC ICE candidate (only relevant to a self-hosted LiveKit container; ignored when `LIVEKIT_URL` points at LiveKit Cloud). |
| `S3_ENDPOINT_URL` / `S3_REGION` / `S3_BUCKET` | Object storage target. In dev `S3_ENDPOINT_URL` points at the in-compose `rustfs` service (`http://rustfs:9000`); leave it **empty** for real AWS S3 so boto3 hits the regional endpoint. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Object-store credentials. Dev defaults are `rustfsadmin`/`rustfsadmin` (the rustfs container's keys); set real values in prod. |
| `S3_FORCE_PATH_STYLE` | Must be `true` for rustfs / minio / most non-AWS endpoints; set `false` for AWS S3. |
| `NEXT_PUBLIC_API_URL` | Browser-facing API URL (inlined into the client bundle at build time). When empty, the frontend uses its `/api/*` rewrite to reach the API over the compose bridge. |
| `POSTGRES_PORT` / `API_PORT` / `FRONTEND_PORT` / `S3_PORT` / `S3_CONSOLE_PORT` | Host-side port mappings only — never read inside containers. |

### Runtime configuration after init

Env/YAML config covers secrets and pre-boot infrastructure (DB URL, JWT secret, LiveKit keys, S3 endpoint/credentials, host ports). Everything else — institute identity, app timezone, export timezone, master consent version — is operator-set during `/setup/initialize` and persisted in the `system_config` table. Consumers read from the cached `LiveConfig` (`backend/app/services/system_config.py`); the env vars `MASTER_CONSENT_VERSION` / `APP_TIMEZONE` only exist now to prefill the setup wizard's form.

## Hosting

The compose stack is portable — copy this directory to any Docker host and run `docker compose up --build`. For production override at minimum:

- `JWT_SECRET` (long random string)
- `POSTGRES_PASSWORD`
- **Serve over HTTPS** and keep `COOKIE_SECURE=true` (the default). The `Secure` flag means browsers won't send the session cookie over plain HTTP, which is the right behaviour for prod but will silently break any HTTP deployment.
- `CORS_ALLOW_ORIGINS=` only needs values if the browser talks to the API on a different origin than the frontend (e.g. `api.clinic.example.com` vs `clinic.example.com`). For the default `/api` rewrite, leave it empty.
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` and a real `LIVEKIT_URL` (LiveKit Cloud or self-hosted). Point your LiveKit project's webhook at `POST /livekit/webhook` so meetings auto-finalise when a room closes.
- Object storage: set `S3_ENDPOINT_URL` to your S3 endpoint (or empty for AWS S3), a real `S3_BUCKET`, and real `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. The bundled `rustfs` container is **dev-only** — don't expose it as your production store.

No admin/healthworker accounts are auto-created — the sys-admin is created through `/setup/initialize`, and admin/healthworker accounts are created afterwards via the wizard's optional stage 3 or `POST /sysadmin/accounts`.

After deploy, run through the first-run wizard from a trusted machine. The setup token is printed to the api container's stdout and written to `/data/setup-token` (in the `api_data` named volume); a single `/setup/initialize` POST seals the system and the token becomes invalid.

Other production gaps to plug before any non-dev deployment:

- No reverse proxy / TLS termination. Put Caddy / Traefik / nginx in front of ports 3000 and 8000. **TLS is mandatory** — `COOKIE_SECURE=true` is the default and browsers won't send the session cookie over plain HTTP.
- CORS defaults closed (`CORS_ALLOW_ORIGINS` empty) and uses `allow_credentials=True`. This is correct for the bundled `/api` rewrite where every browser request is same-origin. For cross-origin deploys, set `CORS_ALLOW_ORIGINS` to a comma-separated list of explicit origins — wildcards are forbidden in credentialed mode.
- The bundled `rustfs` object store is dev-only — point `S3_*` at a managed/hardened S3 in production. `db` and `rustfs` have compose healthchecks; `api` and `frontend` do not.
- No background worker, mailer, or scheduler.
- Single instance per service, no replicas.

To run against managed Postgres, replace the `db` service with a `DATABASE_URL` value pointed at the managed instance — note that `docker-compose.yml` currently composes `DATABASE_URL` inline from `POSTGRES_*` vars (not from a `${DATABASE_URL}` interpolation), so you'll need to edit `docker-compose.yml` directly.

## Project layout

```
HapuTele2.0/
├── docker-compose.yml          # db (postgres:16-alpine) + rustfs (S3) + api + frontend; api_data volume mounts /data
├── .env.example                # all runtime config (env layer)
├── config.yaml.example         # same keys for the optional YAML config layer (CONFIG_FILE)
├── backend/                    # FastAPI service
│   ├── Dockerfile              # python:3.12-slim
│   ├── entrypoint.sh           # wait-for-db → alembic upgrade → bootstrap_setup_token → uvicorn
│   ├── alembic.ini / alembic/  # migrations (0001 … 0007 at HEAD)
│   ├── requirements.txt
│   ├── requirements-dev.txt    # pytest + httpx (for backend/tests/)
│   ├── demo_seed.py            # opt-in demo data builder (manual, not on boot)
│   ├── tests/                  # pytest + FastAPI TestClient (first-run setup integration tests)
│   └── app/                    # FastAPI source
│       ├── middleware/         # setup_gate (pre-init 409s), request_id
│       ├── routers/            # setup, sysadmin, auth, doctors, patients, livekit_webhook, ...
│       ├── scripts/            # bootstrap_setup_token (generate/reuse/rotate setup token)
│       └── services/           # system_config (LiveConfig cache), signature, livekit, storage (S3)
└── frontend/                   # Next.js 14 (App Router) client
    ├── Dockerfile              # node:20-alpine, three-stage standalone build
    ├── next.config.mjs         # /api/* rewrite → http://api:8000
    └── src/{app,components,lib,types}/
```
