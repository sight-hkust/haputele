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

`GET /health` is a pure liveness probe (no DB/S3 dependency) returning `{"status": "ok", "uptime": <seconds>, "version": <git ref>, "build_date": <UTC ISO-8601 build timestamp>, "hostname": <container hostname>, "commit": <git sha>}`. `version` / `build_date` / `commit` are baked into the image at build time (CI passes the git ref, sha, and build timestamp; local builds fall back to `dev` / `unknown` markers).

`?full=true` switches `/health` to a readiness probe: Postgres (`SELECT 1`), the object store (`head_bucket`), and LiveKit (TCP reachability of `LIVEKIT_URL`; empty URL → `not_configured`, which is not a failure) are checked concurrently. Every check is hard-bounded at ~2s and the whole probe is capped at 3s — a hung check is abandoned and reported as `timed out`, so the response can never stall. The response gains a `dependencies` block where each probed entry carries its measured `latency_ms`; error entries carry the exception class name only (internal endpoints stay out of the unauthenticated body; full detail goes to the api logs). Any failing configured dependency → `status: "degraded"` + `503`. Results are single-flight and cached for ~2s, so hammering the probe does not multiply connections to the backing services.

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
| admin        | (operator-chosen) | (operator-chosen)                      | wizard stage 3 (optional) or `POST /accounts` (sys-admin only) |
| healthworker | (operator-chosen) | (operator-chosen)                      | wizard stage 3 (optional) or `POST /accounts` (sys-admin or admin) |
| doctor       | (operator-chosen) | (operator-chosen)                      | `POST /doctors` from the admin or sys-admin UI |

All four roles are unified behind a single `/login` form — there are no role tabs. The backend looks up the account by username alone and the response carries the resolved role, which decides where the client lands.

**Who may create and manage whom.** `/accounts` serves both administrative roles, but the target roles each may touch are derived from the caller, not from a fixed list:

| Caller    | May create & manage      | Doctors                            |
|-----------|--------------------------|------------------------------------|
| sys-admin | admin, healthworker      | full lifecycle via `/doctors`      |
| admin     | healthworker             | full lifecycle via `/doctors`      |

An admin gets no reach over `admin` or `sys-admin` rows — not create, not reset-password, not even roster visibility, since `GET /accounts` withholds those rows rather than flagging them. That boundary is the point: an admin able to mint admins or reset an admin's password would have promoted itself to sys-admin. Every endpoint derives its gate from `manageable_roles()` in `routers/accounts.py`, and `tests/test_account_role_matrix.py` checks the whole caller × target × endpoint grid.

`sys-admin` is platform-administrative (logs, backups, observability) and is the **only** DB-enforced singleton (`accounts_one_sysadmin_idx`); it can only be minted by `/setup/initialize`, never by `/accounts`. As of migration `0007_relax_role_singletons`, **admin and healthworker are no longer singletons** — the operator can create as many of each as needed via the wizard or `POST /accounts`. (The old `accounts_one_admin_idx` / `accounts_one_healthworker_idx` indexes were a relic of the shared-kiosk `seed.py` era and have been dropped.)

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

#### Migration 0017 — pre-existing whitespace usernames

`0017_username_no_whitespace` adds a CHECK forbidding whitespace in `accounts.username`. It applies the constraint `NOT VALID` first — which still rejects every new and updated row — and only promotes it with `VALIDATE CONSTRAINT` once it has confirmed the table is clean. On a clean database that all happens in one transaction and the end state is an ordinary validated constraint; **no operator action is needed.**

If the database already holds a whitespace-bearing username (possible before this policy shipped), the upgrade **succeeds anyway** and logs a `MANUAL REMEDIATION REQUIRED` banner listing the offending usernames in `repr()` form so the invisible character is visible. It does not repair them: `username` is the primary key, so trimming `' alice'` to `'alice'` can collide with an existing account or silently merge two people's records.

```bash
docker compose logs api | grep -A 30 "MANUAL REMEDIATION"   # see the offenders
docker compose exec db psql -U hapu haputele -c \
  "SELECT convalidated FROM pg_constraint WHERE conname = 'accounts_username_no_whitespace';"
```

Those accounts are already unreachable — login is an exact primary-key lookup against what the user types, and nobody can type a leading space they cannot see. For each one, either `DELETE FROM accounts WHERE username = '<old>';` or rename it to a name you have checked is free, then finish with `ALTER TABLE accounts VALIDATE CONSTRAINT accounts_username_no_whitespace;`.

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

No admin/healthworker accounts are auto-created — the sys-admin is created through `/setup/initialize`, and admin/healthworker accounts are created afterwards via the wizard's optional stage 3 or `POST /accounts`.

After deploy, run through the first-run wizard from a trusted machine. The setup token is printed to the api container's stdout and written to `/data/setup-token` (in the `api_data` named volume); a single `/setup/initialize` POST seals the system and the token becomes invalid.

### Automated AWS deployment (Terraform + Ansible)

`deployment/` provisions a single AWS Lightsail VM and runs the whole stack with `docker compose` behind Caddy (automatic TLS). It is driven by the **Deployment** GitHub Actions workflow (`.github/workflows/deploy.yml`, `workflow_dispatch` → intent `plan` / `apply` / `destroy`). There is no orchestrator — Nomad was removed.

How the pieces fit:

- **Terraform** (`deployment/*.tf`) only creates infrastructure and *generates secrets*. It makes the VM, firewall, and SSH key, and combines the sops-encrypted secrets (`secrets.yaml`: Cloudflare R2 + Resend) with auto-generated ones (`JWT_SECRET`, the Postgres password, LiveKit key/secret) into one file. That file is **ansible-vault-encrypted** by `deployment/scripts/ansible-vault-encrypt.sh` (deterministically, so it doesn't churn) and shipped to the VM via cloud-init `write_files` as `/etc/haputele/vault.yml`. Cloud-init does nothing else.
- **Ansible** (`deployment/ansible/`) runs as the next CI step over SSH: installs Docker, decrypts the vault, renders `/opt/haputele/.env` + a `Caddyfile`, and brings up `docker-compose.prod.yml` (Postgres, api, frontend, self-hosted LiveKit, Caddy). Non-secret config (domain, image tags, timezones, …) comes from Terraform outputs passed as `-e @vars.json`.

Operational notes:

- **Required CI secret:** `ANSIBLE_VAULT_PASSWORD` — used by Terraform to encrypt the vault and by Ansible to decrypt it.
- **Secret rotation rebuilds the VM.** Cloud-init `user_data` is immutable (ForceNew), so changing any secret changes the vault ciphertext and replaces the instance. Non-secret changes (new image tags, domain config) only re-run Ansible — no VM rebuild.
- **Migrating off Nomad (one-time):** the old state still references the removed `nomad` provider, so run a `terraform destroy` of the previous stack before the first `apply`, or `terraform state rm` the `nomad_job.*` / `null_resource.wait_for_nomad` resources first.

### Backups and restore

Postgres lives on a host bind mount (`/opt/postgres/data`) on a single VM, so a lost disk is a total loss. A systemd timer dumps it nightly to a **separate** Cloudflare R2 bucket.

| | |
|---|---|
| Schedule | 03:00 local (`haputele-backup.timer`), ±5 min jitter, catch-up on boot |
| Destination | `s3://<BACKUP_S3_BUCKET>/postgres/haputele-<UTC timestamp>.dump` |
| Format | `pg_dump -Fc` — compressed, selectively restorable |
| Retention | 30 days, pruned after each successful upload |
| Credentials | `BACKUP_S3_*` — a bucket-scoped R2 token, **not** the app's `S3_*` keys, so an app compromise cannot reach the backups |
| Scope | The database only. Blobs (attachments, signatures) live in R2 already; they are not in the dump — see gaps below. |

```bash
systemctl list-timers haputele-backup     # when it next runs
systemctl start haputele-backup.service   # back up now
journalctl -u haputele-backup -n 50       # what happened last night

/opt/haputele/restore.sh --list                                  # what is available
/opt/haputele/restore.sh latest --yes-drop-existing              # restore newest
/opt/haputele/restore.sh haputele-2026-08-12T031500Z.dump --yes-drop-existing
```

`restore.sh` is destructive — it drops existing objects before reloading — so the confirmation flag is mandatory. It validates the dump before touching the live database, stops `api`/`frontend` during the reload, and brings the stack back up even if the restore fails.

**Rebuilding from nothing:** `terraform apply` → Ansible → `restore.sh latest --yes-drop-existing`. Expect to lose up to 24h of writes (whatever happened after the last nightly dump).

**Rehearse it.** A backup nobody has restored from is a hypothesis. Do a full drill — seed, destroy, restore — and record how long it took here.

Known gaps, in rough priority order:

- **Secret rotation still rebuilds the VM** and therefore wipes `/opt/postgres/data` (see the ForceNew note above). Restoring from backup is now the documented recovery, but moving secrets out of `user_data` into the Ansible run would remove the coupling entirely.
- **Blob deletion is unrecoverable.** The database stores object keys; the bytes are in R2. A DB restore cannot bring back a deleted attachment — enable R2 object versioning on the media bucket.
- **No alerting.** A timer that silently stops firing looks exactly like one that is working. A dead-man's-switch ping at the end of `backup.sh` would close this.
- **Dumps are not client-side encrypted.** R2 encrypts at rest, but the dumps contain patient data and anyone with the backup token can read them.
- **Key escrow:** `secrets.yaml` has a single age recipient, and the deploy SSH key exists only in Terraform state. Losing either is a bad day; losing both during an incident is a much worse one.

Other production gaps to plug before any non-dev deployment:

- The bundled dev `docker-compose.yml` has no reverse proxy / TLS — put Caddy / Traefik / nginx in front of ports 3000 and 8000 if you deploy it directly. **TLS is mandatory** — `COOKIE_SECURE=true` is the default and browsers won't send the session cookie over plain HTTP. (The automated AWS deployment above already fronts the stack with Caddy + ACME TLS.)
- CORS defaults closed (`CORS_ALLOW_ORIGINS` empty) and uses `allow_credentials=True`. This is correct for the bundled `/api` rewrite where every browser request is same-origin. For cross-origin deploys, set `CORS_ALLOW_ORIGINS` to a comma-separated list of explicit origins — wildcards are forbidden in credentialed mode.
- The bundled `rustfs` object store is dev-only — point `S3_*` at a managed/hardened S3 in production. `db` and `rustfs` have compose healthchecks; `api` and `frontend` do not.
- No background worker, mailer, or scheduler.
- Single instance per service, no replicas.

To run against managed Postgres, replace the `db` service with a `DATABASE_URL` value pointed at the managed instance — note that `docker-compose.yml` currently composes `DATABASE_URL` inline from `POSTGRES_*` vars (not from a `${DATABASE_URL}` interpolation), so you'll need to edit `docker-compose.yml` directly.

## Development

Day-to-day development against a checkout:

- **Backend** — Python 3.12 virtualenv plus `pip install -r backend/requirements-dev.txt`; run `pytest` from `backend/`. A reachable Postgres and S3 endpoint are needed or the DB-backed tests silently skip (the CI workflow wires both up as service containers).
- **Frontend** — `cd frontend && npm ci --legacy-peer-deps` (`--legacy-peer-deps` works around a known @fullcalendar peer conflict), then `npm run dev` (:3000), `npm run lint`, `npm run typecheck`.

Contribution standards — issue tracking, branch naming, conventional commits, PR review — live in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). One rule worth knowing up front: the backend Pydantic models define the API contract, and the frontend's typed clients under `frontend/src/gen` are generated from them. After touching backend request/response models, refresh the client:

```bash
cd frontend && npm run generate:api   # exports the OpenAPI spec from the app, then runs Kubb
```

CI runs the same command: PRs fail if the committed client drifted, and a push to `main` that somehow lands stale gets an automated "regenerate API client" PR to merge.

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
│       ├── routers/            # setup, sysadmin, accounts, auth, doctors, patients, livekit_webhook, ...
│       ├── scripts/            # bootstrap_setup_token (generate/reuse/rotate setup token)
│       └── services/           # system_config (LiveConfig cache), signature, livekit, storage (S3)
└── frontend/                   # Next.js 14 (App Router) client
    ├── Dockerfile              # node:20-alpine, three-stage standalone build
    ├── next.config.mjs         # /api/* rewrite → http://api:8000
    └── src/{app,components,lib,types}/
```
