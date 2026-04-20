# Production Deployment Runbook

Last updated: 2026-04-20

This document captures the first production server setup for PixelProject.

## Production Snapshot

- Repository: `https://github.com/Zappos-work/PixelProject`
- Production URL: `https://pixel.zappos-dev.work`
- Server project directory: `/opt/pixelproject`
- Frontend: Next.js, React, TypeScript
- Backend: FastAPI, Python
- Database: PostgreSQL
- Cache: Redis
- Deployment: Docker Compose
- Reverse proxy: Caddy

The repository was originally focused on local development, so the first production setup uses a separate server-side Compose file.

## Domain And DNS

The correct production domain is:

```text
pixel.zappos-dev.work
```

The old planning domain was:

```text
pixel.zappos-work.uk
```

That old domain caused Caddy certificate failures because it did not resolve. The observed error was an NXDOMAIN lookup for `pixel.zappos-work.uk`.

DNS checks used during setup:

```bash
dig +short pixel.zappos-dev.work @1.1.1.1
dig +short pixel.zappos-dev.work @8.8.8.8
dig +short NS zappos-dev.work @1.1.1.1
```

Expected results:

```text
185.239.239.86
185.239.239.86
ajay.ns.cloudflare.com.
ariadne.ns.cloudflare.com.
```

## Production Compose Setup

The production project lives in:

```text
/opt/pixelproject
```

The server-side production Compose file is:

```text
/opt/pixelproject/compose.prod.yml
```

Production services:

- `caddy`
- `frontend`
- `backend`
- `db`
- `redis`

Public ports:

- `80`
- `443`

Internal ports:

- `frontend:3000`
- `backend:8000`
- `db:5432`
- `redis:6379`

PostgreSQL and Redis are intentionally not exposed directly to the public internet.

## Caddy Reverse Proxy

The server-side Caddyfile is:

```text
/opt/pixelproject/ops/Caddyfile
```

Current production routing:

```caddyfile
pixel.zappos-dev.work {
	encode gzip

	@api path /api/* /docs* /openapi.json
	handle @api {
		reverse_proxy backend:8000
	}

	handle {
		reverse_proxy frontend:3000
	}
}
```

Routes:

- `https://pixel.zappos-dev.work` -> frontend
- `https://pixel.zappos-dev.work/api/v1/...` -> backend
- `https://pixel.zappos-dev.work/docs` -> backend API docs
- `https://pixel.zappos-dev.work/openapi.json` -> backend OpenAPI schema

Caddy manages HTTPS automatically through Let's Encrypt once DNS points to the server.

## Frontend 502 Fix

The first production frontend request returned `HTTP/2 502`, while the backend health endpoint already worked.

Working backend health response:

```json
{
  "status": "ok",
  "environment": "production",
  "service_status": {
    "api": true,
    "database": true,
    "redis": true
  }
}
```

Cause:

- The frontend container was not fully built or ready when Caddy started proxying requests.

Fix:

- Add a frontend healthcheck.
- Make `caddy` depend on `frontend: healthy`.

Expected container state after the fix:

```text
backend    healthy
frontend   healthy
db         healthy
redis      healthy
caddy      running
```

## Production Environment

The server `.env` contains production values. It must never be committed.

Important production variables:

```env
BACKEND_CORS_ORIGINS=https://pixel.zappos-dev.work
FRONTEND_APP_URL=https://pixel.zappos-dev.work
GOOGLE_REDIRECT_URI=https://pixel.zappos-dev.work/api/v1/auth/google/callback
NEXT_PUBLIC_API_BASE_URL=https://pixel.zappos-dev.work/api/v1
WORLD_CHUNK_SIZE=4000
WORLD_EXPANSION_BUFFER=0
WORLD_EXPANSION_CLAIM_FILL_RATIO=0.7
POSTGRES_PASSWORD=<server secret>
SECRET_KEY=<server secret>
DATABASE_URL=postgresql+asyncpg://pixelproject:<server secret>@db:5432/pixelproject
```

World growth variables:

- `WORLD_CHUNK_SIZE=4000`: each active gameplay chunk is `4,000 x 4,000`.
- `WORLD_EXPANSION_BUFFER=0`: border-buffer growth is disabled.
- `WORLD_EXPANSION_CLAIM_FILL_RATIO=0.7`: the active field expands after `70%` claimed Holder coverage.

The PostgreSQL user password was also updated inside PostgreSQL:

```sql
ALTER USER pixelproject WITH PASSWORD '<server secret>';
```

Do not store real passwords, secret keys, private SSH keys, or webhook URLs in repository files.

## Google OAuth

Production Google OAuth settings:

Authorized JavaScript origin:

```text
https://pixel.zappos-dev.work
```

Authorized redirect URI:

```text
https://pixel.zappos-dev.work/api/v1/auth/google/callback
```

Local development entries can remain enabled:

```text
http://localhost:3000
http://localhost:8000/api/v1/auth/google/callback
```

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set only in the server `.env`.

## Local Accounts Versus Server Accounts

Local and production accounts are separate because they live in separate PostgreSQL databases.

- Local account data lives in the local Docker PostgreSQL database.
- Server account data lives in the production PostgreSQL database.
- GitHub stores code, not database rows.

For migrations or disaster recovery, back up PostgreSQL separately from the Git repository.

## Admin Account

The first production account was promoted to admin after login.

Useful inspection command:

```bash
docker compose -f compose.prod.yml exec db psql -U pixelproject -d pixelproject -c "\dt"
```

Relevant tables at first production deploy:

- `area_contributors`
- `auth_sessions`
- `claim_areas`
- `users`
- `world_chunks`
- `world_pixels`

Admin promotion pattern:

```sql
UPDATE users
SET role = 'admin', updated_at = now()
WHERE public_id = 1 AND display_name = 'Zappos';
```

Verification pattern:

```sql
SELECT public_id, display_name, role
FROM users
WHERE public_id = 1;
```

Expected role:

```text
admin
```

## PostgreSQL Backups

Backup directory:

```text
/opt/pixelproject/backups/postgres
```

Backup script:

```text
/opt/pixelproject/backup-postgres.sh
```

Script:

```bash
#!/bin/bash
set -euo pipefail

PROJECT_DIR="/opt/pixelproject"
BACKUP_DIR="$PROJECT_DIR/backups/postgres"
DATE="$(date +%Y-%m-%d_%H-%M-%S)"
FILE="$BACKUP_DIR/pixelproject_$DATE.sql.gz"

cd "$PROJECT_DIR"

docker compose -f compose.prod.yml exec -T db pg_dump -U pixelproject -d pixelproject | gzip > "$FILE"

find "$BACKUP_DIR" -type f -name "pixelproject_*.sql.gz" -mtime +14 -delete

echo "Backup created: $FILE"
```

The backup test created a file matching this pattern:

```text
pixelproject_YYYY-MM-DD_HH-MM-SS.sql.gz
```

Backup permissions:

```bash
chmod 600 /opt/pixelproject/backups/postgres/*.sql.gz
chmod 700 /opt/pixelproject/backups
chmod 700 /opt/pixelproject/backups/postgres
```

Cron entry:

```cron
15 3 * * * /opt/pixelproject/backup-postgres.sh >> /opt/pixelproject/backups/backup.log 2>&1
```

Result:

- A PostgreSQL backup is created daily at 03:15 server time.
- Backups older than 14 days are deleted automatically.

## Deploy User

The production deploy user exists and can run Docker:

```text
uid=1000(deploy)
groups=deploy,sudo,users,docker
```

This user is intended for GitHub Actions SSH deployments.

## GitHub Actions SSH Setup

Server-side SSH key files:

```text
/home/deploy/.ssh/github_actions_pixelproject
/home/deploy/.ssh/github_actions_pixelproject.pub
```

The public key was added to:

```text
/home/deploy/.ssh/authorized_keys
```

The private key was stored as a GitHub repository secret. Never commit it.

Expected GitHub repository secrets:

```text
PIXEL_HOST
PIXEL_SSH_KEY
PIXEL_SSH_PORT
```

Values:

- `PIXEL_HOST`: production server IP or host
- `PIXEL_SSH_PORT`: production SSH port
- `PIXEL_SSH_KEY`: private OpenSSH key for the `deploy` user

## Auto Deploy

The production server is deployed through the GitHub Actions workflow at:

```text
.github/workflows/deploy.yml
```

Expected deploy flow:

1. Push to `main`.
2. GitHub Actions connects to the server over SSH as `deploy`.
3. The workflow runs:

```bash
git config --global --add safe.directory /opt/pixelproject
cd /opt/pixelproject
git fetch origin main
git reset --hard origin/main
export WORLD_CHUNK_SIZE=4000
export WORLD_EXPANSION_BUFFER=0
export WORLD_EXPANSION_CLAIM_FILL_RATIO=0.7
docker compose -f compose.prod.yml up -d --build --remove-orphans
docker image prune -f
docker compose -f compose.prod.yml ps
curl -fsS https://pixel.zappos-dev.work/api/v1/health
```

The workflow exports the current world growth values before `docker compose up` so an older server-local Compose default does not keep the backend on the previous `5,000 x 5,000` setup.

The workflow uses `concurrency` group `pixelproject-production`, so only one production deployment should run at a time.

## Git Dubious Ownership Fix

GitHub Actions initially failed with:

```text
fatal: detected dubious ownership in repository at '/opt/pixelproject'
```

Fix:

```bash
chown -R deploy:deploy /opt/pixelproject
sudo -u deploy git config --global --add safe.directory /opt/pixelproject
sudo -u deploy bash -lc "cd /opt/pixelproject && git status"
```

## Server-Local Files

Some files currently exist only on the server and should not appear in normal Git status output:

- `.env`
- `compose.prod.yml`
- `backup-postgres.sh`
- `backups/`
- `ops/`

The server excludes them through `.git/info/exclude`, not through repository `.gitignore`:

```bash
cat >> .git/info/exclude <<'EOF'
.env
compose.prod.yml
backup-postgres.sh
backups/
ops/
EOF
```

This keeps server-specific secrets and operational files local to the server.

## Discord Deploy Notifications

The current deploy workflow includes Discord notifications for success and failure.

Use a regenerated Discord webhook and store it as:

```text
DISCORD_WEBHOOK_URL
```

Do not reuse a webhook that was pasted into chat or logs. Regenerate exposed Discord webhooks before storing them in GitHub Secrets.

The current workflow expects this secret. If `DISCORD_WEBHOOK_URL` is missing, the deploy can still finish on the server but the notification step may fail the GitHub Actions run.

Planned success message:

```text
PixelProject deploy successful.
Branch: main
Commit: ...
Run: ...
```

Planned failure message:

```text
PixelProject deploy FAILED.
```

Failure notifications should include or reference `deploy_error.log`.

## Current Production Health Check

Health endpoint:

```bash
curl https://pixel.zappos-dev.work/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "environment": "production",
  "service_status": {
    "api": true,
    "database": true,
    "redis": true
  }
}
```

## Open Production Work

Recommended next operations work:

1. Regenerate the Discord webhook and store it in `DISCORD_WEBHOOK_URL`.
2. Test the next `main` push end to end and confirm the deploy plus Discord notification.
3. Consider making Discord notification optional if the secret is temporarily missing.
4. Harden SSH: disable root login and password login.
5. Add external backups, for example Restic, SFTP, or object storage.
6. Decide whether `compose.prod.yml` and `ops/Caddyfile` should become sanitized repository templates.
7. Improve production Dockerfiles with separate build and runtime stages.
8. Add monitoring for disk usage, container health and backup freshness.
