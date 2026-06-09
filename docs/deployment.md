# Production Deployment

## Architecture

```
Internet ──→ Caddy (:443) ──→ backend (:3000)    API + SPA (Hono, CSP nonce injection)
                  │          ──→ ws-server (:4000)  WebSocket
                  │
                  └── Auto TLS (Let's Encrypt)
```

Caddy terminates TLS and proxies all traffic. The backend serves both API and SPA static assets (with CSP nonce injection). Application services are internal-only (no direct port exposure).

## Prerequisites

- Docker + Docker Compose
- A public domain name pointing to the server IP
- Ports 80 and 443 open on the firewall

## Quick Start

```bash
# 1. Set environment variables
cp .env.example .env.prod.local
# Edit .env.prod.local — fill in all required variables

# 2. Build and start
docker compose --env-file .env.prod.local -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 3. Run database migrations (or db:push for first deploy)
docker compose --env-file .env.prod.local -f docker-compose.yml -f docker-compose.prod.yml exec backend pnpm db:migrate

# 4. Verify
curl https://your-domain.com/health
```

## Environment Variables

| Variable            | Required | Example              |
| ------------------- | -------- | -------------------- |
| `DOMAIN`            | yes      | `collab.example.com` |
| `JWT_SECRET`        | yes      | 64-char random hex   |
| `POSTGRES_USER`     | yes      | `postgres`           |
| `POSTGRES_PASSWORD` | yes      | 32-char random       |
| `POSTGRES_DB`       | yes      | `collab_db`          |
| `REDIS_PASSWORD`    | yes      | 32-char random       |
| `RUSTFS_USER`       | yes      | `rustfsadmin`        |
| `RUSTFS_PASSWORD`   | yes      | 32-char random       |
| `RUSTFS_BUCKET`     | no       | `collab-files`       |
| `INTERNAL_API_SECRET`| yes     | 32-char random       |
| `SMTP_HOST`         | yes      | `smtp.example.com`   |
| `SMTP_PORT`         | no       | `465`                |
| `SMTP_USER`         | yes      | `noreply@example.com`|
| `SMTP_PASS`         | yes      | app-password         |
| `SMTP_FROM`         | yes      | `noreply@example.com`|
| `ACME_EMAIL`        | no       | `admin@example.com`  |

## TLS

Caddy auto-provisions and renews Let's Encrypt certificates. No manual certificate management needed.

Certificates are persisted in Docker volumes (`caddy_data`, `caddy_config`) — they survive container restarts.

To use staging Let's Encrypt (for testing, avoids rate limits):

```caddyfile
{$DOMAIN:localhost} {
    tls {
        ca https://acme-staging-v02.api.letsencrypt.org/directory
    }
    ...
}
```

## Email Deliverability (SPF/DKIM)

To avoid password-reset emails being marked as spam, configure these DNS records for your domain:

**SPF (Sender Policy Framework):**
```
TXT  @  "v=spf1 a mx include:your-smtp-provider.com ~all"
```

**DKIM (DomainKeys Identified Mail):**
Generate a DKIM key pair and publish the public key as a TXT record. Most SMTP providers (SendGrid, AWS SES, Mailgun) provide DKIM keys automatically.

**DMARC (optional but recommended):**
```
TXT  _dmarc  "v=DMARC1; p=quarantine; rua=mailto:admin@example.com"
```

## Database Backups

```bash
# Backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres collab_db > backup-$(date +%Y%m%d).sql

# Restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres collab_db < backup.sql
```

## Monitoring

- `/health` — liveness check (all services)
- `/metrics` — Prometheus metrics (backend only)

## Service Ports (Internal)

| Service    | Port    | Notes            |
| ---------- | ------- | ---------------- |
| Caddy      | 80, 443 | Public           |
| Backend    | 3000    | Internal (API + SPA) |
| WS Server  | 4000    | Internal         |
| PostgreSQL | 5432    | Internal         |
| Redis      | 6379    | Internal         |
| RustFS     | 9000    | Internal         |

## Updating

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend pnpm db:push
```
